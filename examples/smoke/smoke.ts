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
import { activeMembershipCountByRole, resolveActiveMembership } from '@govcore/tenancy'
import { listAuditForOrg, writeAuditLog } from '@govcore/audit'
import {
  addMembership,
  createTestDb,
  createTestOrg,
  createTestUser,
  withTenant,
} from '@govcore/testing'
import {
  approveBreakGlass,
  getActiveActAsSession,
  getUnlockedOrgIds,
  grantBreakGlass,
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
  buildContentTable,
  buildLinkTable,
  compileContentType,
  defineContentType,
  listLinkedIds,
} from '@govcore/content'

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
  await app.close()

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
  const article = defineContentType({
    name: 'article',
    fields: [
      { name: 'title', type: 'text', required: true },
      { name: 'primary_tag', type: 'reference', to: 'tag' }, // to-one
      { name: 'tags', type: 'link', to: 'tag' }, // to-many (junction)
    ],
  })
  const ddl = postgres(smokeUrl, { max: 1 })
  for (const def of [note, tag, article]) await ddl.unsafe(compileContentType(def).sql) // tag before article (FK)
  await ddl.unsafe(`GRANT USAGE ON SCHEMA content TO ${APP_ROLE}`)
  await ddl.unsafe(`GRANT SELECT, INSERT, DELETE ON ALL TABLES IN SCHEMA content TO ${APP_ROLE}`)
  await ddl.end()

  const noteTable = buildContentTable(note)
  const tagTable = buildContentTable(tag)
  const articleTable = buildContentTable(article)
  const articleTags = buildLinkTable(article, 'tags')
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
      .values({ organizationId: orgA.id, title: 'Doc', primaryTagId: t1.id })
      .returning()
    await addLink(tx, articleTags, { sourceId: art.id, targetId: t1.id, organizationId: orgA.id })
    await addLink(tx, articleTags, { sourceId: art.id, targetId: t2.id, organizationId: orgA.id })
    await addLink(tx, articleTags, { sourceId: art.id, targetId: t1.id, organizationId: orgA.id }) // idempotent
    return { t1, t2, art }
  })
  check('content: reference persisted the to-one FK', (rel.art as { primaryTagId: string }).primaryTagId === rel.t1.id)
  const linked = await withTenant(ceApp.db, orgA.id, (tx) => listLinkedIds(tx, articleTags, rel.art.id))
  check('content: link junction lists both targets (idempotent add)', linked.length === 2 && linked.includes(rel.t2.id))
  const linkedB = await withTenant(ceApp.db, orgB.id, (tx) => listLinkedIds(tx, articleTags, rel.art.id))
  check('content: link junction is RLS-isolated (orgB sees 0)', linkedB.length === 0)
  await ceApp.close()

  console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'} — ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
