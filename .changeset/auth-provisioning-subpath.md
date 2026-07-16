---
"@govcore/auth": minor
---

Expose `provisionUser` via an import-light `@govcore/auth/provisioning` subpath (#127)

`provisionUser` was only reachable from the main entry, which also exports `createAuth` → pulls `next-auth` → imports bare `next/server`, so any vitest (node env) suite that loaded a module importing `provisionUser` failed to resolve `next/server`. The new `@govcore/auth/provisioning` subpath re-exports the same, already import-light `provisioning.ts` (schema/audit/tenancy/password only) with no next-auth in its graph — the same pattern as `@govcore/auth/password-flows`. The main-entry re-export is unchanged for app callers.
