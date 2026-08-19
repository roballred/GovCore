// @govcore/setup — first-run bootstrap for an empty instance.
//
// Every consumer reinvents this: GovCRM's seed.ts and GovEA's setup action both
// (a) provision the non-owner runtime role + grants (the two-role split — getting
// the grants wrong silently breaks RLS or the app) and (b) create the first org +
// instance-admin so the instance is usable at all. Both are owner/superuser-run,
// day-one operations. `bootstrap` refuses to run against a non-empty instance, so
// it is safe to leave wired into a deploy step.
//
// Composes the invariant-bearing helpers (password hashing/policy, membership
// write-sync, audit) rather than re-hand-rolling them — only the org+admin insert
// is direct, because at first run there is no prior actor and the whole thing must
// be one transaction.

import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { organizations, users, type GovcoreDb } from '@govcore/schema'
import { slugify, upsertMembership } from '@govcore/tenancy'
// Import from the leaf `./password` module, not the package entry, so @govcore/setup
// does not transitively pull @govcore/auth's opt-in next-auth augmentation (#108).
import { hashPassword, validatePassword, type PasswordPolicy } from '@govcore/auth/password'
import { writeAuditLog } from '@govcore/audit'
import { assertSafeIdentifier } from './identifier'

export { assertSafeIdentifier } from './identifier'

export interface ProvisionRuntimeRoleOptions {
  /** Owner/superuser connection string — role creation and GRANT are DDL. */
  connectionString: string
  /** The non-owner runtime role to create (RLS binds it). */
  role: string
  /** Login password for the role. */
  password: string
  /** Schemas to grant DML + default privileges on. Default `['govcore']`. */
  schemas?: string[]
  log?: (message: string) => void
}

/**
 * Create the non-owner runtime role (idempotent) and grant it DML on the given
 * schemas, including **default privileges** so tables created later (e.g. the
 * content engine's compiled tables) are reachable without re-granting. This is
 * the role the app connects as — it must NOT be a superuser, so RLS binds it
 * (see @govcore/auth's `authDb` for why login still needs a separate pool).
 *
 * Content-engine consumers pass `schemas: ['govcore', 'content']` once the
 * `content` schema exists.
 */
export async function provisionRuntimeRole(opts: ProvisionRuntimeRoleOptions): Promise<void> {
  assertSafeIdentifier(opts.role, 'role')
  const schemas = opts.schemas ?? ['govcore']
  schemas.forEach((s) => assertSafeIdentifier(s, 'schema'))
  const log = opts.log ?? (() => {})

  const sql = postgres(opts.connectionString, { max: 1 })
  try {
    await runRoleProvisioning(sql as unknown as ProvisionSql, {
      role: opts.role,
      password: opts.password,
      schemas,
      log,
    })
  } finally {
    await sql.end()
  }
}

// Session GUC the password is stashed in (as a bound parameter) so it is never
// interpolated into DDL text. Custom GUCs must be dot-qualified.
const PROVISION_PW_GUC = 'govcore.provision_password'

/**
 * The role-creation DDL — **password-free by construction** (#157). The password
 * is delivered separately as a bound parameter and read back here via
 * `current_setting`, then quoted by Postgres' own `format(%L)`. Because the value
 * never appears in this SQL text, a password containing `$$`, `'`, or `\` cannot
 * break out of the dollar-quoted block or inject DDL as the owner. `role` is a
 * validated identifier (letters/digits/underscore), embedded via `%I`. A named
 * dollar-tag (`$govcore_provision$`) is used so the block can't be terminated by
 * a stray `$$` either.
 */
function buildCreateRoleDoBlock(role: string): string {
  assertSafeIdentifier(role, 'role')
  return `DO $govcore_provision$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${role}') THEN
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', '${role}', current_setting('${PROVISION_PW_GUC}'));
  END IF;
END $govcore_provision$;`
}

/** Minimal structural shape of the postgres.js client the DB half needs. */
export interface ProvisionSql {
  (parts: TemplateStringsArray, ...values: unknown[]): Promise<unknown>
  unsafe(query: string): Promise<unknown>
}

/**
 * @internal Exported for unit tests. The DB-facing half of `provisionRuntimeRole`,
 * split out so the injection-safety of role creation can be asserted without a
 * live Postgres (see index.test.ts). The password reaches Postgres only through
 * the bound `set_config` parameter — never through `sql.unsafe` text.
 */
export async function runRoleProvisioning(
  sql: ProvisionSql,
  opts: { role: string; password: string; schemas: string[]; log: (message: string) => void },
): Promise<void> {
  await sql`SELECT set_config(${PROVISION_PW_GUC}, ${opts.password}, false)`
  try {
    await sql.unsafe(buildCreateRoleDoBlock(opts.role))
  } finally {
    // Don't leave the plaintext password lingering in session state.
    await sql`SELECT set_config(${PROVISION_PW_GUC}, ${''}, false)`
  }
  for (const schema of opts.schemas) {
    await sql.unsafe(`GRANT USAGE ON SCHEMA ${schema} TO ${opts.role}`)
    await sql.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${opts.role}`)
    await sql.unsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${opts.role}`)
    await sql.unsafe(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${opts.role}`,
    )
    await sql.unsafe(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT USAGE, SELECT ON SEQUENCES TO ${opts.role}`,
    )
    opts.log(`govcore-setup: granted ${opts.role} on schema ${schema}`)
  }
}

export interface BootstrapOptions {
  organization: { name: string; slug?: string }
  admin: { email: string; name?: string; password: string }
  /** Org role for the first admin. Default `admin`. */
  adminRole?: string
  /** Password policy the initial password must satisfy. */
  policy?: PasswordPolicy
}

export type BootstrapResult =
  | { ok: true; organizationId: string; adminUserId: string }
  | { ok: false; reason: 'already-bootstrapped' | 'missing-fields' | 'weak-password'; message?: string }

/**
 * Create the first organization and its instance-admin on an **empty** instance.
 * Refuses (returns `already-bootstrapped`) if any organization already exists, so
 * it is safe to run repeatedly / leave in a deploy step. Runs as the owner —
 * inserting the first user predates any tenant GUC, which the runtime role's
 * FORCE-RLS would reject.
 *
 * The first admin is the actor of its own creation (self-bootstrap), audited as
 * `platform.bootstrap`. The password is never in the audit payload.
 */
export async function bootstrap(db: GovcoreDb, opts: BootstrapOptions): Promise<BootstrapResult> {
  const name = opts.organization.name.trim()
  const email = opts.admin.email.trim().toLowerCase()
  if (!name || !email || !opts.admin.password) {
    return { ok: false, reason: 'missing-fields' }
  }
  const validation = validatePassword(opts.admin.password, opts.policy)
  if (!validation.valid) return { ok: false, reason: 'weak-password', message: validation.message }

  const [existing] = await db.select({ id: organizations.id }).from(organizations).limit(1)
  if (existing) return { ok: false, reason: 'already-bootstrapped' }

  const adminRole = opts.adminRole ?? 'admin'
  const slug = opts.organization.slug?.trim() || slugify(name)
  const passwordHash = await hashPassword(opts.admin.password)
  const adminUserId = randomUUID()

  const result = await db.transaction(async (tx) => {
    const [org] = await tx.insert(organizations).values({ name, slug }).returning()
    await tx
      .insert(users)
      .values({
        id: adminUserId,
        organizationId: org.id,
        email,
        name: opts.admin.name?.trim() || null,
        passwordHash,
        role: adminRole,
        instanceRole: 'instance_admin',
      })
    await upsertMembership(tx, {
      userId: adminUserId,
      organizationId: org.id,
      role: adminRole,
      isPrimary: true,
    })
    await writeAuditLog(tx, {
      action: 'platform.bootstrap',
      entityType: 'organization',
      entityId: org.id,
      organizationId: org.id,
      userId: adminUserId,
      after: { organization: name, slug, admin: email, instanceRole: 'instance_admin' },
    })
    return { organizationId: org.id, adminUserId }
  })
  return { ok: true, ...result }
}
