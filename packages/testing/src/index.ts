// @govcore/testing — factories + helpers for exercising GovCore against a real
// Postgres. Not edge-safe (creates a postgres-js client).

import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres, { type Sql } from 'postgres'
import {
  organizations,
  userOrganizationMemberships,
  users,
  type GovcoreDb,
} from '@govcore/schema'

export interface TestDb {
  db: GovcoreDb
  client: Sql
  close: () => Promise<void>
}

/** Open a postgres-js-backed Drizzle db for tests. Reads DATABASE_URL by default. */
export function createTestDb(connectionString = process.env.DATABASE_URL): TestDb {
  if (!connectionString) throw new Error('@govcore/testing: set DATABASE_URL')
  const client = postgres(connectionString, { max: 1 })
  const db = drizzle(client) as unknown as GovcoreDb
  return { db, client, close: () => client.end() }
}

let seq = 0
const uid = () => `${Date.now().toString(36)}-${seq++}`

export async function createTestOrg(
  db: GovcoreDb,
  overrides: Partial<{ name: string; slug: string }> = {},
) {
  const slug = overrides.slug ?? `org-${uid()}`
  const [org] = await db
    .insert(organizations)
    .values({ name: overrides.name ?? slug, slug })
    .returning()
  return org
}

export async function createTestUser(
  db: GovcoreDb,
  opts: { organizationId: string; email?: string; role?: string | null },
) {
  const [user] = await db
    .insert(users)
    .values({
      organizationId: opts.organizationId,
      email: opts.email ?? `user-${uid()}@example.test`,
      role: opts.role ?? null,
    })
    .returning()
  return user
}

export async function addMembership(
  db: GovcoreDb,
  opts: {
    userId: string
    organizationId: string
    role: string
    isPrimary?: boolean
    isActive?: boolean
  },
) {
  const [membership] = await db
    .insert(userOrganizationMemberships)
    .values({
      userId: opts.userId,
      organizationId: opts.organizationId,
      role: opts.role,
      isPrimary: opts.isPrimary ?? false,
      isActive: opts.isActive ?? true,
    })
    .returning()
  return membership
}

/**
 * Run `fn` inside a transaction with the active-org GUC set, exactly as the
 * runtime does at request time (design §13.1) — so RLS policies apply. Use this
 * with a NON-owner DB role to actually observe tenant isolation (a superuser
 * bypasses RLS).
 */
export async function withTenant<T>(
  db: GovcoreDb,
  organizationId: string,
  fn: (tx: GovcoreDb) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_org', ${organizationId}, true)`)
    return fn(tx as unknown as GovcoreDb)
  })
}
