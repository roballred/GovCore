// @govcore/schema — platform table definitions + schema version.
// Edge-safe entrypoint (no DB client). The migrate runner is ./migrate.

import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'

export * from './schema'

/**
 * A Drizzle Postgres database **or** transaction handle. Functions in the
 * tenancy/audit packages accept this so callers inject their own client (the
 * app's `postgres-js` db, or a `tx` inside a transaction — which extends it).
 */
export type GovcoreDb = PgDatabase<PgQueryResultHKT, any, any>

/**
 * True when `err` is (or wraps) a Postgres unique-constraint violation
 * (SQLSTATE 23505). Pure and edge-safe — inspects `code`, touches no DB client.
 * Lets operator flows turn a duplicate slug/email into a typed result instead of
 * a 500. Walks the `cause` chain because Drizzle wraps the driver error in a
 * `DrizzleQueryError` and puts the `postgres-js`/`pg` error (which carries the
 * `code`) on `.cause` — so the top-level error's own `code` is undefined.
 */
export function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && typeof e === 'object' && depth < 5; depth++) {
    if ((e as { code?: string }).code === '23505') return true
    e = (e as { cause?: unknown }).cause
  }
  return false
}

/**
 * Bumped whenever the platform schema changes. Written to instance settings on
 * boot for observability ("this instance runs platform schema vN", design §5),
 * and stamped into backup archives (design §13.5). Not load-bearing for
 * correctness — the migrations are — but useful for diagnostics.
 */
export const CORE_SCHEMA_VERSION = '0.0.0'
