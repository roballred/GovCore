// Runtime-role GRANT matrix (#152).
//
// The non-owner runtime role is what tenantActions connect as. RLS binds it on
// org-scoped tables — but several platform tables are intentionally *outside*
// RLS (Auth.js adapter tables, support/operator singletons, organizations as
// the tenant root). A blanket `GRANT … ON ALL TABLES` therefore lets a
// compromised runtime pool delete orgs, steal session tokens, or forge
// break-glass rows. This module is the least-privilege matrix: explicit grants
// for RLS-bound (and SELECT-only) tables; everything else stays owner/authDb/
// operatorDb only.
//
// Role name is app-configured, so grants are applied by `provisionRuntimeRole`
// (re-run on upgrade), not by `govcore-migrate`.

/** Schema that owns the platform tables and the privilege split. */
export const PLATFORM_SCHEMA = 'govcore'

/**
 * Org-scoped / federation tables the runtime role may fully DML.
 * All of these have FORCE RLS keyed on `app.current_org`.
 */
export const RUNTIME_DML_TABLES = [
  'users',
  'user_organization_memberships',
  'org_connections',
  'cross_org_links',
] as const

/**
 * Append-only audit: INSERT + SELECT only. UPDATE/DELETE are blocked by the
 * immutability trigger; withholding those privileges is defense in depth.
 */
export const RUNTIME_AUDIT_TABLE = 'audit_log'

/**
 * Tenant-root table: runtime needs SELECT for the org-lifecycle gate in
 * `tenantAction`. Writes (create/rename/suspend/…) are operator/setup only.
 */
export const RUNTIME_SELECT_TABLES = ['organizations'] as const

/**
 * Tables the runtime role must not touch. Auth.js adapter tables belong on
 * `authDb`; support/operator/config + the migrate journal belong on the
 * privileged pool.
 */
export const RUNTIME_REVOKED_TABLES = [
  'accounts',
  'sessions',
  'verification_tokens',
  'break_glass_sessions',
  'act_as_sessions',
  'instance_settings',
  'platform_config',
  '__govcore_migrations',
] as const

export type RuntimeGrantStatements = {
  /** Statements that tear down any prior blanket grants on `govcore`. */
  revoke: string[]
  /** Statements that apply the least-privilege matrix on `govcore`. */
  grant: string[]
  /** Statements for a non-platform schema (e.g. `content`) — full DML + defaults. */
  otherSchema: (schema: string) => string[]
}

/**
 * Build the idempotent SQL statements for one runtime role.
 * Identifiers are assumed already validated by {@link assertSafeIdentifier}.
 */
export function buildRuntimeGrantStatements(role: string): RuntimeGrantStatements {
  const dmlList = RUNTIME_DML_TABLES.map((t) => `${PLATFORM_SCHEMA}.${t}`).join(', ')
  const selectList = RUNTIME_SELECT_TABLES.map((t) => `${PLATFORM_SCHEMA}.${t}`).join(', ')
  const audit = `${PLATFORM_SCHEMA}.${RUNTIME_AUDIT_TABLE}`

  const revoke = [
    // Tear down historical blanket ALL-TABLES grants (#152) so a re-run of
    // provisionRuntimeRole actually removes excess privilege.
    `REVOKE ALL ON ALL TABLES IN SCHEMA ${PLATFORM_SCHEMA} FROM ${role}`,
    `REVOKE ALL ON ALL SEQUENCES IN SCHEMA ${PLATFORM_SCHEMA} FROM ${role}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${PLATFORM_SCHEMA} REVOKE ALL ON TABLES FROM ${role}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${PLATFORM_SCHEMA} REVOKE ALL ON SEQUENCES FROM ${role}`,
  ]

  const grant = [
    `GRANT USAGE ON SCHEMA ${PLATFORM_SCHEMA} TO ${role}`,
    `GRANT SELECT ON ${selectList} TO ${role}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ${dmlList} TO ${role}`,
    `GRANT SELECT, INSERT ON ${audit} TO ${role}`,
    // Sequences are uncommon (uuid PKs), but keep USAGE for anything that appears.
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${PLATFORM_SCHEMA} TO ${role}`,
  ]

  const otherSchema = (schema: string): string[] => [
    `GRANT USAGE ON SCHEMA ${schema} TO ${role}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${role}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${role}`,
    // Content-engine tables are FORCE-RLS'd by the compiler; default privileges
    // keep newly compiled tables reachable without re-granting.
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT USAGE, SELECT ON SEQUENCES TO ${role}`,
  ]

  return { revoke, grant, otherSchema }
}
