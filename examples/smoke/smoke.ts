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

  console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'} — ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
