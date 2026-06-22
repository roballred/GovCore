// Seed a throwaway demo database: create it, migrate it, and insert an instance
// admin + sample orgs/users/memberships/audit so the instance console has data.
//
//   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/govcore_demo \
//     pnpm --filter @govcore/example-minimal-app seed

import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from '@govcore/schema/migrate'
import { hashPassword } from '@govcore/auth/password'
import {
  auditLog,
  organizations,
  userOrganizationMemberships,
  users,
} from '@govcore/schema'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('Set DATABASE_URL (e.g. postgresql://postgres:postgres@127.0.0.1:5432/govcore_demo)')
  process.exit(2)
}

const target = new URL(url)
const dbName = target.pathname.replace(/^\//, '')
const adminUrl = (() => {
  const u = new URL(url)
  u.pathname = '/postgres'
  return u.toString()
})()

async function main() {
  // 1. fresh database
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} })
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`)
  await admin.unsafe(`CREATE DATABASE ${dbName}`)
  await admin.end()
  console.log(`• created ${dbName}`)

  // 2. migrate
  await migrate({ connectionString: url, log: (m) => console.log(`  ${m}`) })

  // 3. seed
  const sql = postgres(url!, { max: 1, onnotice: () => {} })
  const db = drizzle(sql)

  const [orgA] = await db
    .insert(organizations)
    .values({ name: 'City of Example', slug: 'city-of-example' })
    .returning()
  const [orgB] = await db
    .insert(organizations)
    .values({ name: 'County of Example', slug: 'county-of-example' })
    .returning()

  const passwordHash = await hashPassword('govcore-demo')
  const [admin1] = await db
    .insert(users)
    .values({
      organizationId: orgA.id,
      email: 'admin@govcore.test',
      name: 'Avery Admin',
      role: 'admin',
      instanceRole: 'instance_admin',
      passwordHash,
    })
    .returning()
  const [member1] = await db
    .insert(users)
    .values({ organizationId: orgA.id, email: 'sam@city.example', name: 'Sam Member', role: 'member' })
    .returning()
  const [viewer1] = await db
    .insert(users)
    .values({ organizationId: orgB.id, email: 'val@county.example', name: 'Val Viewer', role: 'viewer' })
    .returning()

  await db.insert(userOrganizationMemberships).values([
    { userId: admin1.id, organizationId: orgA.id, role: 'admin', isPrimary: true },
    { userId: member1.id, organizationId: orgA.id, role: 'member', isPrimary: true },
    { userId: viewer1.id, organizationId: orgB.id, role: 'viewer', isPrimary: true },
  ])

  await db.insert(auditLog).values([
    { action: 'org.create', entityType: 'organization', entityId: orgA.id, organizationId: orgA.id, userId: admin1.id },
    { action: 'org.create', entityType: 'organization', entityId: orgB.id, organizationId: orgB.id, userId: admin1.id },
    { action: 'user.invite', entityType: 'user', entityId: member1.id, organizationId: orgA.id, userId: admin1.id },
  ])

  await sql.end()
  console.log('• seeded 2 orgs, 3 users, 3 memberships, 3 audit events')
  console.log('  sign in: admin@govcore.test / govcore-demo')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
