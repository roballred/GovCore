# @govcore/schema

Platform table definitions, enums, the authored migrations, and the
`govcore-migrate` runner. All platform tables live in the `govcore` Postgres
schema. See the design doc §5 and §13.1–§13.2.

## Two entrypoints

- **`@govcore/schema`** — table definitions + `orgScoped` + `CORE_SCHEMA_VERSION`.
  Edge-safe (only `drizzle-orm/pg-core`); importable into Next middleware.
- **`@govcore/schema/migrate`** — the migration runner (`postgres` + `node:fs`).
  **Not** edge-safe; server-only.

## Migrations

Authored SQL in [`migrations/`](./migrations), applied in lexical order by
`govcore-migrate`, each in its own transaction, tracked in
`govcore.__govcore_migrations` (separate from an app's own Drizzle journal).

| File | Contents |
|---|---|
| `0000_platform_init.sql` | schema, enums, tables, FKs, indexes |
| `0001_platform_security.sql` | append-only `audit_log` trigger; RLS policies + `FORCE ROW LEVEL SECURITY` on `users` / memberships / `audit_log` |

> Core **owns** this DDL (design §5). It must stay in sync with
> [`src/schema.ts`](./src/schema.ts). A schema-conformance test is a follow-up.

## Two-role database (design §13.2)

- **`govcore-migrate`** runs as the **owner / DDL** role:
  set `GOVCORE_MIGRATE_DATABASE_URL` (falls back to `DATABASE_URL`).
- The **app runtime** connects as a separate **non-owner** role, which RLS binds.

## Tenant isolation (design §13.1)

RLS policies key off `current_setting('app.current_org')`. The runtime sets it
**transaction-locally** per request — `select set_config('app.current_org', $org, true)`
— inside the tenant transaction (the `@govcore/server` `tenantAction`, later phase).
Unset GUC ⇒ all rows hidden (deny by default).

## Roles are `text`, not an enum

Per-org and per-user `role` columns are `text`, not a fixed `pgEnum` — GovCore
ships no role vocabulary. The app defines valid roles via `@govcore/rbac`'s
`createRbac`.

## Usage

```ts
// app schema: re-export core tables, add domain tables scoped to the tenant
export * from '@govcore/schema'
import { organizations, orgScoped } from '@govcore/schema'
export const permits = pgTable('permits', { ...orgScoped(organizations), title: text('title') })
```

```jsonc
// app package.json — platform migrations run before the app's own
"db:migrate": "govcore-migrate && drizzle-kit migrate"
```
