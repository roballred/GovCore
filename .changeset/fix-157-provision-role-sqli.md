---
"@govcore/setup": patch
---

security: `provisionRuntimeRole` no longer interpolates the role password into DDL (#157)

The runtime-role password was interpolated into a `DO $$ … $$` block with only
single-quote escaping, so a password containing `$$` (or `'` / `\`) could terminate
the dollar-quote and inject SQL as the owner/setup role. The password is now
delivered to Postgres as a bound `set_config` parameter and quoted server-side by
`format(%L)` — it never appears in SQL text — and role creation is idempotent via
`IF NOT EXISTS`. No API change; `provisionRuntimeRole`'s signature is unchanged.
