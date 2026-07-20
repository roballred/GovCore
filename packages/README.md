# GovCore packages

Versioned `@govcore/*` packages that make up the platform core. The authoritative
reference is [`docs/architecture.md`](../docs/architecture.md) — see
[the packages](../docs/architecture.md#the-packages-and-why-there-are-many) for the
layout and the edge-safe/DB-touching split.

## Packages (all implemented, published to npm at `0.x`)

| Package | Responsibility |
|---|---|
| `@govcore/rbac` | Generic role/permission machinery (`createRbac`) |
| `@govcore/schema` | Platform tables, enums, migrations, `govcore-migrate` runner |
| `@govcore/theme` | WCAG-AA base theme + safe theming |
| `@govcore/audit` | Append-only audit writer (trigger ships in `@govcore/schema`) |
| `@govcore/tenancy` | Active-org resolution + membership/org guards |
| `@govcore/auth` | `createAuth` factory, SSO guard, password, sessions |
| `@govcore/federation` | Org connections, cross-org links + link lifecycle, visibility |
| `@govcore/support` | Break-glass + act-as + instance admin |
| `@govcore/backup` | Whole-tenant export/restore to JSON + cross-org clone |
| `@govcore/middleware` | Edge-safe `createMiddleware` factory |
| `@govcore/server` | `tenantAction` + tenant transaction |
| `@govcore/setup` | First-run bootstrap: runtime-role provisioning + first org/admin |
| `@govcore/testing` | Test factories (`createTestDb`/`Org`/`User`, `addMembership`, `withTenant`) |
| `@govcore/nextkit` | UI primitives + reusable instance-console React + `AppShell` |
| `@govcore/content` | Content engine (define-a-type-as-data) |

An end-to-end smoke harness lives in `examples/smoke` (`pnpm smoke` with `DATABASE_URL` set; runs
against Postgres in CI): it runs `govcore-migrate` then exercises rbac/tenancy/audit, the
audit-immutability trigger, RLS isolation under a non-owner role, the support lifecycle,
federation connections, a backup round-trip, and the full content engine (compiled RLS tables,
relationships, computed fields, hooks, generated actions, taxonomy, recipes, and the Capability
spike).

## Conventions

- Packages publish built output (`main`/`exports` → `dist/`); `@govcore/rbac` is the one that stays source-first. `pnpm build` (tsc) emits `dist/` + declarations. A consumer that resolves `dist` does **not** need the package in its Tailwind `content` glob or `transpilePackages`; a source-first one does — check `main` before assuming.
- Each package extends the root [`tsconfig.base.json`](../tsconfig.base.json).
- `@govcore/schema`, `@govcore/rbac`, and `@govcore/theme` must stay **edge-safe / DB-free** so they can be imported into Next middleware (see [architecture — the packages](../docs/architecture.md#the-packages-and-why-there-are-many)).
- Every change to a `@govcore/*` package needs a changeset (`pnpm changeset`).
