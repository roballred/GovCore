# @govcore/schema

## 0.1.0

### Minor Changes

- f2f3743: Add `@govcore/schema`: the platform schema (identity, tenancy, auth, audit) in a
  dedicated `govcore` Postgres schema, with the `orgScoped` tenancy-column helper
  and `CORE_SCHEMA_VERSION`. Roles are `text` (app-defined via `@govcore/rbac`),
  not a fixed enum.

  Also adds federation (`org_connections`, `cross_org_links`), support access
  (`break_glass_sessions`, `act_as_sessions`), and instance config
  (`instance_settings`, `platform_config`).

  Ships authored migrations (`0000_platform_init`, `0001_platform_security` —
  append-only audit trigger + Row-Level Security with `FORCE ROW LEVEL SECURITY`;
  `0002_platform_federation_support` — federation tables with a both-participant
  RLS check) and the `govcore-migrate` runner (separate, non-edge `./migrate`
  entrypoint; tracked in `govcore.__govcore_migrations`; runs as the owner/DDL role).
