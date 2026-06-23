// End-to-end smoke harness for GovCore.
//
// Creates a throwaway `govcore_smoke` database on the server in DATABASE_URL,
// runs govcore-migrate, then exercises rbac / tenancy / audit, the audit
// immutability trigger, and RLS tenant isolation under a NON-owner role.
//
//   DATABASE_URL=postgresql://user:pass@localhost:5432/postgres \
//     pnpm --filter @govcore/example-smoke smoke

import postgres from 'postgres'
import { migrate } from '@govcore/schema/migrate'
import { users } from '@govcore/schema'
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

  console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'} — ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
