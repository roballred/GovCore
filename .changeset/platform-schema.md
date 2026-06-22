---
"@govcore/schema": minor
---

Add `@govcore/schema`: the platform schema (identity, tenancy, auth, audit) in a
dedicated `govcore` Postgres schema, with the `orgScoped` tenancy-column helper
and `CORE_SCHEMA_VERSION`. Roles are `text` (app-defined via `@govcore/rbac`),
not a fixed enum.

Ships authored migrations (`0000_platform_init`, `0001_platform_security` —
append-only audit trigger + Row-Level Security with `FORCE ROW LEVEL SECURITY`)
and the `govcore-migrate` runner (separate, non-edge `./migrate` entrypoint;
tracked in `govcore.__govcore_migrations`; runs as the owner/DDL role).
