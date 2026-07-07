// End-to-end smoke harness for GovCore.
//
// Creates a throwaway `govcore_smoke` database on the server in DATABASE_URL,
// runs govcore-migrate, then exercises rbac / tenancy / audit, the audit
// immutability trigger, and RLS tenant isolation under a NON-owner role.
//
//   DATABASE_URL=postgresql://user:pass@localhost:5432/postgres \
//     pnpm --filter @govcore/example-smoke smoke

import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { eq } from 'drizzle-orm'
import { migrate } from '@govcore/schema/migrate'
import { users, userOrganizationMemberships } from '@govcore/schema'
import { createRbac } from '@govcore/rbac'
import {
  activeMembershipCountByRole,
  createOrganization,
  renameOrganization,
  resolveActiveMembership,
  updateUserAdministration,
} from '@govcore/tenancy'
import { adminResetPassword, changePassword, hashPassword, provisionUser, verifyPassword } from '@govcore/auth'
import { listAuditForOrg, writeAuditLog } from '@govcore/audit'
import {
  addMembership,
  createTestDb,
  createTestOrg,
  createTestUser,
  withTenant,
} from '@govcore/testing'
import {
  actAsStatus,
  approveBreakGlass,
  breakGlassStatus,
  getActiveActAsSession,
  getUnlockedOrgIds,
  grantBreakGlass,
  listActAsSessions,
  listBreakGlassSessions,
  orgHasSupportHistory,
  requireActAs,
  requireBreakGlass,
  revokeBreakGlass,
  startActAsSession,
} from '@govcore/support'
import {
  acceptConnection,
  approveCrossOrgLink,
  canReadFederatedEntity,
  clearLinksFlag,
  flagLinksForVisibilityDrop,
  getConnectedOrgIds,
  getCrossOrgLinks,
  getLinksForEntity,
  removeLinksForConnection,
  requestCrossOrgLink,
  requestConnection,
  revokeCrossOrgLink,
} from '@govcore/federation'
import { cloneOrgInto, exportOrg, importOrg, registerBackupTables } from '@govcore/backup'
import {
  addLink,
  applyRecipe,
  buildContentTable,
  buildLinkTable,
  buildTaxonomyTable,
  buildTree,
  compileContentType,
  defineContentType,
  generateContentActions,
  listLinkedIds,
  publish,
  recompute,
  taxonomySchemaDdl,
  withComputed,
  type Recipe,
} from '@govcore/content'
import { contentColumns } from '@govcore/content/screens'
import { createTenantActions } from '@govcore/server'
import { application, capability, capabilityCompleteness, person } from './capability'

const BASE = process.env.DATABASE_URL
if (!BASE) {
  console.error('Set DATABASE_URL (e.g. postgresql://postgres:postgres@localhost:5432/postgres)')
  process.exit(2)
}

const SMOKE_DB = 'govcore_smoke'
const APP_ROLE = 'govcore_smoke_app'
const APP_PW = 'smoke_app_pw'

const withDb = (base: string, name: string) => {
  const u = new URL(base)
  u.pathname = `/${name}`
  return u.toString()
}
const withCreds = (url: string, user: string, pw: string) => {
  const u = new URL(url)
  u.username = user
  u.password = pw
  return u.toString()
}

let pass = 0
let fail = 0
const check = (name: string, cond: boolean, detail = '') => {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.error(`  ✗ ${name} ${detail}`)
  }
}

async function main() {
  // 1. fresh throwaway database
  console.log('• creating fresh database', SMOKE_DB)
  const admin = postgres(withDb(BASE!, 'postgres'), { max: 1 })
  await admin.unsafe(`DROP DATABASE IF EXISTS ${SMOKE_DB} WITH (FORCE)`)
  await admin.unsafe(`CREATE DATABASE ${SMOKE_DB}`)
  await admin.end()

  const smokeUrl = withDb(BASE!, SMOKE_DB)

  // 2. migrate
  console.log('• govcore-migrate')
  const { applied } = await migrate({ connectionString: smokeUrl, log: (m) => console.log(`  ${m}`) })
  check('migrations applied', applied.length >= 1, `(applied ${applied.length})`)

  // 3. seed (as owner/superuser — bypasses RLS, which is fine for seeding)
  const owner = createTestDb(smokeUrl)
  const orgA = await createTestOrg(owner.db, { slug: 'org-a' })
  const orgB = await createTestOrg(owner.db, { slug: 'org-b' })
  const userA = await createTestUser(owner.db, { organizationId: orgA.id, role: 'admin' })
  const userB = await createTestUser(owner.db, { organizationId: orgB.id, role: 'admin' })
  await addMembership(owner.db, { userId: userA.id, organizationId: orgA.id, role: 'admin', isPrimary: true })

  // 4. tenancy
  const active = await resolveActiveMembership(owner.db, userA.id)
  check(
    'resolveActiveMembership → orgA/admin',
    active?.organizationId === orgA.id && active?.role === 'admin',
    JSON.stringify(active),
  )
  const adminCount = await activeMembershipCountByRole(owner.db, orgA.id, 'admin')
  check('activeMembershipCountByRole(admin) === 1', adminCount === 1, `(${adminCount})`)

  // 5. rbac (generic createRbac with a GovEA-like map)
  const rbac = createRbac({
    rolePermissions: {
      admin: ['content:read', 'users:manage'],
      contributor: ['content:read'],
      viewer: ['content:read'],
    },
    hierarchy: { admin: 3, contributor: 2, viewer: 1 },
  })
  check('rbac: admin has users:manage', rbac.hasPermission('admin', 'users:manage'))
  check('rbac: viewer lacks users:manage', !rbac.hasPermission('viewer', 'users:manage'))
  check('rbac: roleAtLeast(admin, contributor)', rbac.roleAtLeast('admin', 'contributor'))

  // 6. audit write + read
  await writeAuditLog(owner.db, {
    action: 'org.create',
    entityType: 'organization',
    entityId: orgA.id,
    organizationId: orgA.id,
    userId: userA.id,
  })
  const auditRows = await listAuditForOrg(owner.db, orgA.id)
  check('audit row written + readable', auditRows.length === 1 && auditRows[0].action === 'org.create', `(${auditRows.length})`)

  // 6b. password flows: self-service change + operator reset over @govcore/schema.users
  await owner.db.update(users).set({ passwordHash: await hashPassword('initial-pw-1', 4) }).where(eq(users.id, userA.id))

  const wrongCurrent = await changePassword(owner.db, {
    userId: userA.id,
    currentPassword: 'not-the-password',
    newPassword: 'brand-new-pw-2',
  })
  check(
    'changePassword rejects a wrong current password',
    !wrongCurrent.ok && wrongCurrent.reason === 'current-incorrect',
    JSON.stringify(wrongCurrent),
  )

  const changed = await changePassword(owner.db, {
    userId: userA.id,
    currentPassword: 'initial-pw-1',
    newPassword: 'brand-new-pw-2',
  })
  check('changePassword succeeds with the correct current password', changed.ok, JSON.stringify(changed))

  const [afterChange] = await owner.db.select().from(users).where(eq(users.id, userA.id)).limit(1)
  check(
    'changePassword actually rehashed the row',
    !!afterChange.passwordHash && (await verifyPassword('brand-new-pw-2', afterChange.passwordHash)),
  )

  const reused = await changePassword(owner.db, {
    userId: userA.id,
    currentPassword: 'brand-new-pw-2',
    newPassword: 'brand-new-pw-2',
  })
  check('changePassword rejects reuse of the current password', !reused.ok && reused.reason === 'reused', JSON.stringify(reused))

  const weak = await changePassword(owner.db, {
    userId: userA.id,
    currentPassword: 'brand-new-pw-2',
    newPassword: 'short',
  })
  check('changePassword enforces the policy on the new password', !weak.ok && weak.reason === 'weak-password', JSON.stringify(weak))

  const reset = await adminResetPassword(owner.db, {
    userId: userA.id,
    newPassword: 'operator-set-pw-3',
    actorUserId: userB.id,
  })
  check('adminResetPassword succeeds without the current password', reset.ok, JSON.stringify(reset))

  const [afterReset] = await owner.db.select().from(users).where(eq(users.id, userA.id)).limit(1)
  check(
    'adminResetPassword rehashed + cleared lockout state',
    (await verifyPassword('operator-set-pw-3', afterReset.passwordHash!)) &&
      afterReset.failedLoginAttempts === 0 &&
      afterReset.lockoutUntil === null,
  )

  const pwAudit = await listAuditForOrg(owner.db, orgA.id)
  const pwActions = pwAudit.map((r) => r.action)
  check(
    'password change + reset audited (fail, change, reset)',
    pwActions.includes('auth.password_change_failed') &&
      pwActions.includes('auth.password_changed') &&
      pwActions.includes('auth.password_reset'),
    pwActions.join(','),
  )
  check(
    'reset audit is attributed to the operator, not the target',
    pwAudit.find((r) => r.action === 'auth.password_reset')?.userId === userB.id,
  )
  check(
    'no audit payload leaks a password',
    !pwAudit.some((r) => /initial-pw-1|brand-new-pw-2|operator-set-pw-3/.test(JSON.stringify(r))),
  )

  // 6c. operator console flows: org + user administration (audited; on a fresh
  // org so orgA/orgB assertions below stay untouched).
  const consoleOrg = await createOrganization(owner.db, { name: 'Town of Cedar Falls', actorUserId: userA.id })
  check('createOrganization succeeds + auto-slugs', consoleOrg.ok && consoleOrg.organization.slug === 'town-of-cedar-falls', JSON.stringify(consoleOrg))
  const consoleOrgId = consoleOrg.ok ? consoleOrg.organization.id : ''

  const dupeSlug = await createOrganization(owner.db, { name: 'Town of Cedar Falls', actorUserId: userA.id })
  check('createOrganization rejects a duplicate slug', !dupeSlug.ok && dupeSlug.reason === 'slug-taken', JSON.stringify(dupeSlug))

  const noName = await createOrganization(owner.db, { name: '   ', actorUserId: userA.id })
  check('createOrganization rejects an empty name', !noName.ok && noName.reason === 'name-required')

  const renamed = await renameOrganization(owner.db, { organizationId: consoleOrgId, name: 'City of Cedar Falls', actorUserId: userA.id })
  check('renameOrganization succeeds', renamed.ok)
  const renameMissing = await renameOrganization(owner.db, { organizationId: randomUUID(), name: 'Nowhere', actorUserId: userA.id })
  check('renameOrganization on a missing org → not-found', !renameMissing.ok && renameMissing.reason === 'not-found')

  const prov1 = await provisionUser(owner.db, {
    email: 'admin1@cedarfalls.example', name: 'Admin One', organizationId: consoleOrgId,
    role: 'admin', password: 'cedar-admin-1', actorUserId: userA.id,
  })
  check('provisionUser creates a user + membership', prov1.ok, JSON.stringify(prov1))
  const admin1Id = prov1.ok ? prov1.userId : ''
  check('provisioned user resolves to its org/role via membership',
    (await resolveActiveMembership(owner.db, admin1Id))?.role === 'admin')

  const dupeEmail = await provisionUser(owner.db, {
    email: 'admin1@cedarfalls.example', organizationId: consoleOrgId, role: 'viewer', password: 'another-pw-x', actorUserId: userA.id,
  })
  check('provisionUser rejects a duplicate email', !dupeEmail.ok && dupeEmail.reason === 'email-taken', JSON.stringify(dupeEmail))

  const weakProv = await provisionUser(owner.db, {
    email: 'weak@cedarfalls.example', organizationId: consoleOrgId, role: 'viewer', password: 'short', actorUserId: userA.id,
  })
  check('provisionUser enforces the password policy', !weakProv.ok && weakProv.reason === 'weak-password')

  // last-admin guard: admin1 is the console org's only admin
  const demoteLast = await updateUserAdministration(owner.db, {
    userId: admin1Id, role: 'viewer', isActive: true, instanceAdmin: false, actorUserId: userA.id, adminRole: 'admin',
  })
  check('updateUserAdministration blocks demoting the last admin', !demoteLast.ok && demoteLast.reason === 'last-admin', JSON.stringify(demoteLast))
  const [admin1Still] = await owner.db.select().from(users).where(eq(users.id, admin1Id))
  check('blocked demotion left the row unchanged', admin1Still.role === 'admin')

  // add a second admin, then the demotion is allowed + the membership is synced
  const prov2 = await provisionUser(owner.db, {
    email: 'admin2@cedarfalls.example', organizationId: consoleOrgId, role: 'admin', password: 'cedar-admin-2', actorUserId: userA.id,
  })
  check('provisionUser (second admin) succeeds', prov2.ok)
  const demoteOk = await updateUserAdministration(owner.db, {
    userId: admin1Id, role: 'viewer', isActive: true, instanceAdmin: false, actorUserId: userA.id, adminRole: 'admin',
  })
  check('updateUserAdministration demotes once another admin exists', demoteOk.ok, JSON.stringify(demoteOk))
  check('membership role synced to the demoted role',
    (await resolveActiveMembership(owner.db, admin1Id))?.role === 'viewer')

  // own-instance-admin lockout
  const provIa = await provisionUser(owner.db, {
    email: 'ia@cedarfalls.example', organizationId: consoleOrgId, role: 'viewer', instanceAdmin: true, password: 'cedar-ia-pw', actorUserId: userA.id,
  })
  const iaId = provIa.ok ? provIa.userId : ''
  const selfDemote = await updateUserAdministration(owner.db, {
    userId: iaId, role: 'viewer', isActive: true, instanceAdmin: false, actorUserId: iaId, adminRole: 'admin',
  })
  check('updateUserAdministration blocks removing your own instance-admin', !selfDemote.ok && selfDemote.reason === 'own-instance-admin', JSON.stringify(selfDemote))

  const consoleAudit = await listAuditForOrg(owner.db, consoleOrgId)
  const consoleActions = new Set(consoleAudit.map((r) => r.action))
  check(
    'console flows audited (org.create/update + user.create/update)',
    consoleActions.has('platform.org.create') &&
      consoleActions.has('platform.org.update') &&
      consoleActions.has('platform.user.create') &&
      consoleActions.has('platform.user.update'),
    [...consoleActions].join(','),
  )
  check(
    'no console audit payload leaks a password',
    !consoleAudit.some((r) => /cedar-admin-1|cedar-admin-2|cedar-ia-pw/.test(JSON.stringify(r))),
  )

  // 7. immutability trigger (fires for superuser too)
  let blocked = false
  try {
    await owner.client.unsafe(`UPDATE govcore.audit_log SET action = 'tampered'`)
  } catch {
    blocked = true
  }
  check('audit_log UPDATE blocked by trigger', blocked)
  await owner.close()

  // 8. RLS isolation under a NON-owner role
  const s = postgres(smokeUrl, { max: 1 })
  await s.unsafe(
    `DO $$ BEGIN CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PW}'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  )
  await s.unsafe(`GRANT USAGE ON SCHEMA govcore TO ${APP_ROLE}`)
  await s.unsafe(`GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA govcore TO ${APP_ROLE}`)
  await s.end()

  const app = createTestDb(withCreds(smokeUrl, APP_ROLE, APP_PW))
  const aRows = await withTenant(app.db, orgA.id, (tx) => tx.select().from(users))
  const bRows = await withTenant(app.db, orgB.id, (tx) => tx.select().from(users))
  const noCtx = (await app.db.select().from(users)).length
  check('RLS: orgA context sees only userA', aRows.length === 1 && aRows[0].id === userA.id, `(${aRows.length})`)
  check('RLS: orgB context sees only userB', bRows.length === 1 && bRows[0].id === userB.id, `(${bRows.length})`)
  check('RLS: no org context (deny by default) sees 0 users', noCtx === 0, `(${noCtx})`)

  // 8b. the createAuth login wall (#57): a credentials login looks up the user
  // by email BEFORE any session/org context exists. On the runtime pool that
  // lookup is RLS-filtered to nothing — the CredentialsSignin every consumer
  // hits. A superuser/BYPASSRLS authDb pool is what makes it work (FORCE RLS
  // binds even the owner, so owner alone is not enough).
  const loginOnRuntime = (await app.db.select().from(users).where(eq(users.email, userA.email))).length
  check('login wall: runtime pool finds 0 users by email (no GUC) — the #57 failure', loginOnRuntime === 0, `(${loginOnRuntime})`)
  await app.close()

  const authPlane = createTestDb(smokeUrl) // DATABASE_URL superuser — bypasses FORCE RLS, like authDb
  const loginOnAuthDb = (await authPlane.db.select().from(users).where(eq(users.email, userA.email))).length
  check('login wall fix: authDb pool finds the user by email pre-session', loginOnAuthDb === 1, `(${loginOnAuthDb})`)
  await authPlane.close()

  // 9. support: break-glass + act-as lifecycle (instance-level; not RLS-bound)
  console.log('• support: break-glass + act-as')
  const sup = createTestDb(smokeUrl)
  // 240m grant is over the approval threshold → needs a second admin
  const bg = await grantBreakGlass(sup.db, {
    instanceAdminId: userA.id,
    targetOrgId: orgB.id,
    reason: 'smoke: cross-tenant support',
    ttlMinutes: 240,
  })
  check('break-glass grant >60m requires approval', bg.requiresApproval === true)
  check('pre-approval: requireBreakGlass denies', (await requireBreakGlass(sup.db, userA.id, orgB.id)) === null)

  let selfApproveBlocked = false
  try {
    await approveBreakGlass(sup.db, { sessionId: bg.id, approverId: userA.id })
  } catch {
    selfApproveBlocked = true
  }
  check('self-approval rejected', selfApproveBlocked)

  await approveBreakGlass(sup.db, { sessionId: bg.id, approverId: userB.id })
  const usable = await requireBreakGlass(sup.db, userA.id, orgB.id)
  check('post-approval: requireBreakGlass grants', usable !== null && usable.id === bg.id)
  check('getUnlockedOrgIds includes orgB', (await getUnlockedOrgIds(sup.db, userA.id)).has(orgB.id))

  const aa = await startActAsSession(sup.db, { instanceAdminId: userA.id, targetOrgId: orgB.id }, orgA.id)
  check('startActAsSession opens a session', aa !== null)
  check('child act-as cannot outlive parent', !!aa && !!usable && aa.expiresAt <= usable.expiresAt)
  check('requireActAs(orgB) resolves', !!aa && (await requireActAs(sup.db, aa.id, orgB.id)).id === aa.id)

  let mismatchBlocked = false
  try {
    if (aa) await requireActAs(sup.db, aa.id, orgA.id)
  } catch {
    mismatchBlocked = true
  }
  check('requireActAs(wrong org) rejected', mismatchBlocked)

  // revoking the parent self-terminates the child on next read (no background job)
  await revokeBreakGlass(sup.db, { sessionId: bg.id, instanceAdminId: userA.id })
  check('after parent revoke: act-as read ends + returns null', !!aa && (await getActiveActAsSession(sup.db, aa.id)) === null)
  check('after parent revoke: requireBreakGlass denies', (await requireBreakGlass(sup.db, userA.id, orgB.id)) === null)

  // 9b. read + status layer (#67): operator view, tenant-scoped view, status derivation
  const opBg = await listBreakGlassSessions(sup.db)
  check('listBreakGlassSessions (operator view) sees the session', opBg.some((r) => r.id === bg.id))
  const orgBBg = await listBreakGlassSessions(sup.db, { targetOrgId: orgB.id })
  check(
    'listBreakGlassSessions (tenant-scoped) returns only orgB sessions',
    orgBBg.length >= 1 && orgBBg.every((r) => r.targetOrgId === orgB.id),
  )
  check(
    'tenant visibility: orgA (untouched) has no break-glass sessions',
    (await listBreakGlassSessions(sup.db, { targetOrgId: orgA.id })).length === 0,
  )
  const revokedRow = orgBBg.find((r) => r.id === bg.id)!
  check('breakGlassStatus reflects the revocation', breakGlassStatus(revokedRow) === 'revoked')
  const orgBAa = await listActAsSessions(sup.db, { targetOrgId: orgB.id })
  const endedAa = orgBAa.find((r) => !!aa && r.id === aa.id)!
  check('actAsStatus is "ended" after the parent was revoked', actAsStatus(endedAa) === 'ended')
  check(
    'orgHasSupportHistory: true for the accessed org, false for the untouched one',
    (await orgHasSupportHistory(sup.db, orgB.id)) === true &&
      (await orgHasSupportHistory(sup.db, orgA.id)) === false,
  )
  await sup.close()

  // 10. federation: org connections + federated visibility
  console.log('• federation: connections + visibility')
  const fed = createTestDb(smokeUrl)
  const conn = await requestConnection(fed.db, {
    orgId: orgA.id,
    targetOrgId: orgB.id,
    actorUserId: userA.id,
  })
  check('requestConnection opens pending', conn.status === 'pending')
  check('pending connection is not yet active', (await getConnectedOrgIds(fed.db, orgA.id)).length === 0)

  let dupBlocked = false
  try {
    await requestConnection(fed.db, { orgId: orgA.id, targetOrgId: orgB.id, actorUserId: userA.id })
  } catch {
    dupBlocked = true
  }
  check('duplicate connection request rejected', dupBlocked)

  let wrongAcceptBlocked = false
  try {
    await acceptConnection(fed.db, { connectionId: conn.id, orgId: orgA.id, actorUserId: userA.id })
  } catch {
    wrongAcceptBlocked = true
  }
  check('non-target org cannot accept', wrongAcceptBlocked)

  await acceptConnection(fed.db, { connectionId: conn.id, orgId: orgB.id, actorUserId: userB.id })
  check('after accept: orgA sees orgB connected', (await getConnectedOrgIds(fed.db, orgA.id)).includes(orgB.id))
  check('after accept: orgB sees orgA connected (bilateral)', (await getConnectedOrgIds(fed.db, orgB.id)).includes(orgA.id))
  check('can read connections-visibility across an active connection', (await canReadFederatedEntity(fed.db, orgB.id, 'connections', orgA.id)) === true)
  check('cannot read org-visibility across a connection', (await canReadFederatedEntity(fed.db, orgB.id, 'org', orgA.id)) === false)
  check('can read instance-visibility regardless', (await canReadFederatedEntity(fed.db, orgB.id, 'instance', orgA.id)) === true)
  await fed.close()

  // 11. backup: export → drift → destructive same-org restore round-trip.
  // Registers a real org-scoped platform table (memberships) as the app would.
  console.log('• backup: export / restore round-trip')
  const bk = createTestDb(smokeUrl)
  const registry = registerBackupTables([
    {
      name: 'memberships',
      table: userOrganizationMemberships,
      orgColumn: userOrganizationMemberships.organizationId,
      category: 'content',
    },
  ])
  const orgAMemberships = () =>
    bk.db.select().from(userOrganizationMemberships).where(eq(userOrganizationMemberships.organizationId, orgA.id))

  const bundle = await exportOrg(bk.db, registry, orgA.id, 'archive')
  check('export captures orgA membership', (bundle.data.memberships as unknown[]).length === 1)

  // drift: orgA gains a membership that is NOT in the bundle
  await addMembership(bk.db, { userId: userB.id, organizationId: orgA.id, role: 'viewer' })
  check('drift: orgA now has 2 memberships', (await orgAMemberships()).length === 2)

  const res = await importOrg(bk.db, registry, bundle, { targetOrgId: orgA.id })
  check('restore wiped the drifted rows', res.deleted.memberships === 2)
  check('restore reinserted the bundle rows', res.inserted.memberships === 1)

  const restored = await orgAMemberships()
  check(
    'orgA restored to exactly the exported membership (UUID + user preserved)',
    restored.length === 1 && restored[0].userId === userA.id && restored[0].id === (bundle.data.memberships as Array<{ id: string }>)[0].id,
  )

  // cross-org clone: copy orgA's membership into a fresh org with a regenerated id
  const orgC = await createTestOrg(bk.db, { slug: 'org-c' })
  const sourceMembershipId = (bundle.data.memberships as Array<{ id: string }>)[0].id
  const clone = await cloneOrgInto(bk.db, registry, bundle, { targetOrgId: orgC.id })
  check('clone inserted the membership into orgC', clone.inserted.memberships === 1)
  const orgCMemberships = await bk.db
    .select()
    .from(userOrganizationMemberships)
    .where(eq(userOrganizationMemberships.organizationId, orgC.id))
  check(
    'clone has a NEW id, org=orgC, same user',
    orgCMemberships.length === 1 &&
      orgCMemberships[0].userId === userA.id &&
      orgCMemberships[0].id !== sourceMembershipId &&
      orgCMemberships[0].id === clone.idMap.memberships[sourceMembershipId],
  )
  check('source org membership still intact (clone is additive)', (await orgAMemberships()).length === 1)
  await bk.close()

  // 12. federation cross-org content links (entity ids carry no FK — app-defined)
  console.log('• federation: cross-org content links')
  const lk = createTestDb(smokeUrl)
  const srcId = randomUUID()
  const tgtId = randomUUID()
  const endpoints = {
    sourceEntityType: 'doc',
    sourceEntityId: srcId,
    targetEntityType: 'doc',
    targetEntityId: tgtId,
  }
  const link = await requestCrossOrgLink(lk.db, {
    sourceOrgId: orgA.id,
    targetOrgId: orgB.id,
    linkType: 'references',
    actorUserId: userA.id,
    ...endpoints,
  })
  check('requestCrossOrgLink opens pending', link.status === 'pending')

  let dupLinkBlocked = false
  try {
    await requestCrossOrgLink(lk.db, {
      sourceOrgId: orgA.id,
      targetOrgId: orgB.id,
      linkType: 'references',
      actorUserId: userA.id,
      ...endpoints,
    })
  } catch {
    dupLinkBlocked = true
  }
  check('duplicate link request rejected', dupLinkBlocked)

  let wrongLinkApprove = false
  try {
    await approveCrossOrgLink(lk.db, { linkId: link.id, orgId: orgA.id, actorUserId: userA.id })
  } catch {
    wrongLinkApprove = true
  }
  check('non-target org cannot approve a link', wrongLinkApprove)

  await approveCrossOrgLink(lk.db, { linkId: link.id, orgId: orgB.id, actorUserId: userB.id })
  check('orgA sees the active link', (await getCrossOrgLinks(lk.db, orgA.id)).some((l) => l.id === link.id && l.status === 'active'))

  await flagLinksForVisibilityDrop(lk.db, 'doc', srcId, 'visibility dropped to org')
  check('link flagged for review on visibility drop', (await getLinksForEntity(lk.db, 'doc', srcId))[0].flaggedForReview === true)
  await clearLinksFlag(lk.db, 'doc', srcId)
  check('link flag cleared when visibility restored', (await getLinksForEntity(lk.db, 'doc', srcId))[0].flaggedForReview === false)

  await revokeCrossOrgLink(lk.db, { linkId: link.id, orgId: orgB.id, actorUserId: userB.id })
  check('revoked link is removed', (await getLinksForEntity(lk.db, 'doc', srcId)).length === 0)

  // removeLinksForConnection clears anything remaining between the two orgs
  await requestCrossOrgLink(lk.db, {
    sourceOrgId: orgA.id,
    targetOrgId: orgB.id,
    linkType: 'references',
    actorUserId: userA.id,
    sourceEntityType: 'doc',
    sourceEntityId: randomUUID(),
    targetEntityType: 'doc',
    targetEntityId: randomUUID(),
  })
  const removed = await removeLinksForConnection(lk.db, orgA.id, orgB.id, userA.id, orgA.id)
  check('removeLinksForConnection cleared remaining links', removed.length === 1 && (await getCrossOrgLinks(lk.db, orgA.id)).length === 0)
  await lk.close()

  // 13. content engine: compile types → real RLS-bound tables, with relationships
  console.log('• content engine: compile + RLS + relationships')
  const note = defineContentType({
    name: 'note',
    label: 'Note',
    fields: [
      { name: 'title', type: 'text', required: true },
      { name: 'body', type: 'textarea' },
    ],
  })
  const tag = defineContentType({ name: 'tag', fields: [{ name: 'name', type: 'text', required: true }] })
  const hookLog: string[] = []
  const article = defineContentType({
    name: 'article',
    fields: [
      { name: 'title', type: 'text', required: true },
      { name: 'primary_tag', type: 'reference', to: 'tag' }, // to-one
      { name: 'tags', type: 'link', to: 'tag' }, // to-many (junction)
      { name: 'domain', type: 'taxonomy', tree: 'architecture-domains' }, // filed under a classification node
    ],
    computed: [
      // materialized derived field, refreshed by recompute
      { name: 'well_tagged', type: 'boolean', materialized: true, compute: (row) => Boolean(row.primary_tag_id) },
    ],
    hooks: {
      // publish-readiness gate (Rule 3): real code, throws to block
      beforePublish: (ctx) => {
        if (!ctx.row.primary_tag_id) throw new Error('publish blocked: an article needs a primary tag')
      },
      afterPublish: () => hookLog.push('afterPublish'),
    },
  })
  const ddl = postgres(smokeUrl, { max: 1 })
  await ddl.unsafe(taxonomySchemaDdl()) // engine-owned taxonomy_nodes — article.domain FKs into it
  // person/application before capability (FK targets); capability before its own junctions
  for (const def of [note, tag, article, person, application, capability])
    await ddl.unsafe(compileContentType(def).sql)
  await ddl.unsafe(`GRANT USAGE ON SCHEMA content TO ${APP_ROLE}`)
  await ddl.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA content TO ${APP_ROLE}`)
  await ddl.end()

  const noteTable = buildContentTable(note)
  const tagTable = buildContentTable(tag)
  const articleTable = buildContentTable(article)
  const articleTags = buildLinkTable(article, 'tags')
  const taxonomyNodes = buildTaxonomyTable()
  const personTable = buildContentTable(person)
  const applicationTable = buildContentTable(application)
  const capabilityTable = buildContentTable(capability)
  const capabilityApps = buildLinkTable(capability, 'applications')
  const capabilityChildren = buildLinkTable(capability, 'children')
  const ceApp = createTestDb(withCreds(smokeUrl, APP_ROLE, APP_PW))

  // Rule 1: a generated table is RLS-isolated like any hand-written one
  await withTenant(ceApp.db, orgA.id, (tx) =>
    tx.insert(noteTable).values({ organizationId: orgA.id, title: 'orgA note', body: 'hello' }),
  )
  const aNotes = (await withTenant(ceApp.db, orgA.id, (tx) => tx.select().from(noteTable))) as Array<{
    title: string
    status: string
  }>
  const bNotes = await withTenant(ceApp.db, orgB.id, (tx) => tx.select().from(noteTable))
  check('content: orgA sees its row in the compiled table', aNotes.length === 1 && aNotes[0].title === 'orgA note')
  check('content: generated table is RLS-isolated (orgB sees 0)', bNotes.length === 0)
  check('content: row defaults to draft lifecycle status', aNotes[0].status === 'draft')

  // Rule 2: reference (to-one FK) + link (to-many junction)
  const rel = await withTenant(ceApp.db, orgA.id, async (tx) => {
    const [t1] = await tx.insert(tagTable).values({ organizationId: orgA.id, name: 'arch' }).returning()
    const [t2] = await tx.insert(tagTable).values({ organizationId: orgA.id, name: 'security' }).returning()
    const [art] = await tx
      .insert(articleTable)
      .values({ organizationId: orgA.id, title: 'Doc', primary_tag_id: t1.id })
      .returning()
    await addLink(tx, articleTags, { sourceId: art.id, targetId: t1.id, organizationId: orgA.id })
    await addLink(tx, articleTags, { sourceId: art.id, targetId: t2.id, organizationId: orgA.id })
    await addLink(tx, articleTags, { sourceId: art.id, targetId: t1.id, organizationId: orgA.id }) // idempotent
    return { t1, t2, art }
  })
  check('content: reference persisted the to-one FK', (rel.art as { primary_tag_id: string }).primary_tag_id === rel.t1.id)
  const linked = await withTenant(ceApp.db, orgA.id, (tx) => listLinkedIds(tx, articleTags, rel.art.id))
  check('content: link junction lists both targets (idempotent add)', linked.length === 2 && linked.includes(rel.t2.id))
  const linkedB = await withTenant(ceApp.db, orgB.id, (tx) => listLinkedIds(tx, articleTags, rel.art.id))
  check('content: link junction is RLS-isolated (orgB sees 0)', linkedB.length === 0)

  // Rule 2: computed fields — materialized (recompute) + computed-on-read
  await withTenant(ceApp.db, orgA.id, (tx) => recompute(tx, articleTable, article, rel.art.id))
  const refreshed = (await withTenant(ceApp.db, orgA.id, (tx) =>
    tx.select().from(articleTable).where(eq(articleTable.id, rel.art.id)),
  )) as Array<{ well_tagged: boolean }>
  check('content: recompute persisted the materialized computed column', refreshed[0].well_tagged === true)
  check('content: withComputed derives the value on read', withComputed(article, refreshed[0]).well_tagged === true)

  // Rule 3: per-type hooks via the transition lifecycle
  const [untagged] = (await withTenant(ceApp.db, orgA.id, (tx) =>
    tx.insert(articleTable).values({ organizationId: orgA.id, title: 'Untagged' }).returning(),
  )) as Array<{ id: string }>
  let publishBlocked = false
  try {
    await withTenant(ceApp.db, orgA.id, (tx) => publish(tx, articleTable, article, untagged.id))
  } catch {
    publishBlocked = true
  }
  check('content: beforePublish gate blocks an unready row', publishBlocked && hookLog.length === 0)

  const published = await withTenant(ceApp.db, orgA.id, (tx) => publish(tx, articleTable, article, rel.art.id))
  check('content: publish gate passes for a ready row', published.status === 'published')
  check('content: afterPublish hook fired', hookLog.includes('afterPublish'))
  const persisted = (await withTenant(ceApp.db, orgA.id, (tx) =>
    tx.select().from(articleTable).where(eq(articleTable.id, rel.art.id)),
  )) as Array<{ status: string }>
  check('content: published status persisted', persisted[0].status === 'published')

  // generated CRUD as tenantActions: org from context, RLS, materialized, lifecycle
  const tenantAction = createTenantActions({
    db: ceApp.db,
    getActiveContext: async () => ({ userId: userA.id, organizationId: orgA.id, role: 'admin' }),
  })
  const articleActions = generateContentActions(tenantAction, article, articleTable)
  const created = (await articleActions.create({ title: 'Via action', primary_tag_id: rel.t1.id })) as {
    id: string
    title: string
    organizationId: string
    well_tagged: boolean
  }
  check('content/action: create scopes org from context, applies materialized', created.organizationId === orgA.id && created.well_tagged === true)
  const listedIds = ((await articleActions.list()) as Array<{ id: string }>).map((r) => r.id)
  check('content/action: list is RLS-scoped and includes the new row', listedIds.includes(created.id))
  const pub = (await articleActions.publish({ id: created.id })) as { status: string }
  check('content/action: publish runs the lifecycle gate + hook', pub.status === 'published')
  const got = (await articleActions.get({ id: created.id })) as { status: string }
  check('content/action: get returns the published row', got.status === 'published')

  // taxonomy: seed a classification tree, file a real row under a node, read back
  const tree = await withTenant(ceApp.db, orgA.id, async (tx) => {
    const [biz] = await tx
      .insert(taxonomyNodes)
      .values({ organizationId: orgA.id, tree: 'architecture-domains', label: 'Business', slug: 'business' })
      .returning()
    const [cap] = await tx
      .insert(taxonomyNodes)
      .values({ organizationId: orgA.id, tree: 'architecture-domains', parentId: biz.id, label: 'Capabilities', slug: 'capabilities' })
      .returning()
    // file the article under the child node
    await tx.update(articleTable).set({ domain_node_id: cap.id }).where(eq(articleTable.id, rel.art.id))
    return { biz, cap }
  })
  const filed = (await withTenant(ceApp.db, orgA.id, (tx) =>
    tx.select().from(articleTable).where(eq(articleTable.id, rel.art.id)),
  )) as Array<{ domain_node_id: string }>
  check('content: taxonomy field files the row under a node (FK persisted)', filed[0].domain_node_id === tree.cap.id)

  const nodesA = (await withTenant(ceApp.db, orgA.id, (tx) => tx.select().from(taxonomyNodes))) as Array<{
    id: string
    parentId: string | null
    label: string
    slug: string
    tree: string
  }>
  const roots = buildTree(nodesA)
  check(
    'content: buildTree nests the classification under its root',
    roots.length === 1 && roots[0].id === tree.biz.id && roots[0].children[0]?.id === tree.cap.id,
  )
  const nodesB = await withTenant(ceApp.db, orgB.id, (tx) => tx.select().from(taxonomyNodes))
  check('content: taxonomy_nodes is RLS-isolated (orgB sees 0)', nodesB.length === 0)

  // recipes: install a framework bundle (taxonomy + seed content) per org — ADR-0002
  const togaf: Recipe = {
    name: 'togaf',
    taxonomies: [
      {
        tree: 'togaf-adm',
        nodes: [{ slug: 'business', label: 'Business Architecture', children: [{ slug: 'capabilities', label: 'Capabilities' }] }],
      },
    ],
    content: [
      {
        type: 'article',
        dedupeBy: 'title',
        // the seed row files under the installed node via its <name>_node_id column
        rows: [{ title: 'Seeded Capability', domain_node_id: { $node: { tree: 'togaf-adm', slug: 'capabilities' } } }],
      },
    ],
  }
  const recipeRuntime = {
    organizationId: orgA.id,
    taxonomyTable: taxonomyNodes,
    types: { article: { def: article, table: articleTable } },
  }
  const recipeApplied = await withTenant(ceApp.db, orgA.id, (tx) => applyRecipe(tx, togaf, recipeRuntime))
  check('content/recipe: first apply installs the tree + seeds content', recipeApplied.taxonomyNodes === 2 && recipeApplied.contentRows === 1)

  const seeded = (await withTenant(ceApp.db, orgA.id, (tx) =>
    tx.select().from(articleTable).where(eq(articleTable.title, 'Seeded Capability')),
  )) as Array<{ domain_node_id: string }>
  const capId = recipeApplied.nodeIds['togaf-adm'].capabilities
  check('content/recipe: seed row is filed under the installed node (resolved $node ref)', seeded.length === 1 && seeded[0].domain_node_id === capId)

  const recipeReapplied = await withTenant(ceApp.db, orgA.id, (tx) => applyRecipe(tx, togaf, recipeRuntime))
  check('content/recipe: re-apply is idempotent (no new nodes or rows)', recipeReapplied.taxonomyNodes === 0 && recipeReapplied.contentRows === 0)

  const togafB = await withTenant(ceApp.db, orgB.id, (tx) =>
    tx.select().from(taxonomyNodes).where(eq(taxonomyNodes.tree, 'togaf-adm')),
  )
  check('content/recipe: installed bundle is RLS-isolated (orgB sees 0)', togafB.length === 0)

  // generated screens: the columns the list screen derives map onto the real
  // RLS-scoped row shape (rendering itself is covered by screens.test.tsx).
  const screenRows = (await articleActions.list()) as Array<Record<string, unknown>>
  const realRow = screenRows.find((r) => r.id === created.id) as Record<string, unknown>
  const cols = contentColumns(article)
  const colKeys = cols.map((c) => c.key)
  check(
    'content/screen: derived columns match the real row shape (fields + taxonomy + computed + status)',
    colKeys.join(',') === 'title,primary_tag_id,domain_node_id,well_tagged,status' &&
      cols.every((c) => c.key in realRow) &&
      realRow.title === 'Via action',
  )

  // ── Capability spike (Appendix B §892): the engine on GovEA's richest entity ──
  // 1) the generated table is indistinguishable from a hand-written `capabilities`
  const capSql = compileContentType(capability).sql
  const handWritten = [
    'CREATE TABLE IF NOT EXISTS content.capability (',
    'name text NOT NULL',
    'description text',
    'behaviors text',
    'rules text',
    'capability_type text',
    'owner_id uuid REFERENCES content.person (id) ON DELETE SET NULL',
    'domain_node_id uuid REFERENCES content.taxonomy_nodes (id) ON DELETE SET NULL',
    'completeness numeric', // the materialized computed column
    'organization_id uuid NOT NULL REFERENCES govcore.organizations (id) ON DELETE CASCADE',
    "status text NOT NULL DEFAULT 'draft'",
    "CHECK (status IN ('draft', 'published', 'archived'))",
    'CREATE INDEX IF NOT EXISTS capability_organization_id_idx ON content.capability (organization_id)',
    'CREATE INDEX IF NOT EXISTS capability_owner_id_idx ON content.capability (owner_id)',
    'CREATE INDEX IF NOT EXISTS capability_domain_node_id_idx ON content.capability (domain_node_id)',
    'ALTER TABLE content.capability FORCE ROW LEVEL SECURITY;',
    'CREATE POLICY capability_org_isolation ON content.capability',
    'CREATE TABLE IF NOT EXISTS content.capability__applications (',
    'CREATE TABLE IF NOT EXISTS content.capability__children (',
  ]
  check('spike: generated capability table is indistinguishable from hand-written', handWritten.every((s) => capSql.includes(s)))

  // 2) end to end against Postgres: relationships + completeness + publish gate + taxonomy
  const capActions = generateContentActions(tenantAction, capability, capabilityTable)
  const [capOwner] = (await withTenant(ceApp.db, orgA.id, (tx) =>
    tx.insert(personTable).values({ organizationId: orgA.id, full_name: 'Ada Lovelace' }).returning(),
  )) as Array<{ id: string }>
  const [ledger] = (await withTenant(ceApp.db, orgA.id, (tx) =>
    tx.insert(applicationTable).values({ organizationId: orgA.id, name: 'Ledger' }).returning(),
  )) as Array<{ id: string }>

  const cap = (await capActions.create({ name: 'Payments' })) as { id: string; completeness: unknown }
  check('spike: a new capability scores 0 completeness (nothing filled)', Number(cap.completeness) === 0 && capabilityCompleteness({}) === 0)

  let capBlocked = false
  try {
    await capActions.publish({ id: cap.id })
  } catch {
    capBlocked = true
  }
  check('spike: publish-readiness gate blocks an unready capability', capBlocked)

  // fill it out (owner + domain + description → ready) and wire the traceability links
  await capActions.update({
    id: cap.id,
    values: { description: 'Accept and settle payments', owner_id: capOwner.id, domain_node_id: tree.cap.id },
  })
  const childCap = (await capActions.create({ name: 'Refunds' })) as { id: string }
  await withTenant(ceApp.db, orgA.id, async (tx) => {
    await addLink(tx, capabilityApps, { sourceId: cap.id, targetId: ledger.id, organizationId: orgA.id })
    await addLink(tx, capabilityChildren, { sourceId: cap.id, targetId: childCap.id, organizationId: orgA.id })
  })
  const ready = (await capActions.get({ id: cap.id })) as { completeness: unknown }
  check('spike: completeness materializes after filling owner + domain + description (3/5 = 60)', Number(ready.completeness) === 60)

  const linkedApps = await withTenant(ceApp.db, orgA.id, (tx) => listLinkedIds(tx, capabilityApps, cap.id))
  const linkedKids = await withTenant(ceApp.db, orgA.id, (tx) => listLinkedIds(tx, capabilityChildren, cap.id))
  check('spike: to-many links resolve (applications + child hierarchy)', linkedApps.includes(ledger.id) && linkedKids.includes(childCap.id))

  const capPub = (await capActions.publish({ id: cap.id })) as { status: string }
  check('spike: publish gate passes once the capability is ready', capPub.status === 'published')

  const capB = (await withTenant(ceApp.db, orgB.id, (tx) => tx.select().from(capabilityTable))) as unknown[]
  check('spike: capability is RLS-isolated (orgB sees 0)', capB.length === 0)

  await ceApp.close()

  console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'} — ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
