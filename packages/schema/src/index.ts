// @govcore/schema — platform table definitions + schema version.
// Edge-safe entrypoint (no DB client). The migrate runner is ./migrate.

export * from './schema'

/**
 * Bumped whenever the platform schema changes. Written to instance settings on
 * boot for observability ("this instance runs platform schema vN", design §5),
 * and stamped into backup archives (design §13.5). Not load-bearing for
 * correctness — the migrations are — but useful for diagnostics.
 */
export const CORE_SCHEMA_VERSION = '0.0.0'
