# GovCore

**A reusable, opinionated multi-tenant platform core for Next.js apps.**

GovCore packages the hardened "platform plane" that every serious multi-tenant SaaS re-implements badly — identity, organizations, memberships and active-organization resolution, role-based access control, audit, federation, and support-access (break-glass / act-as) sessions — into versioned `@govcore/*` packages, so a new app can stand up a secure multi-tenant foundation in well under a day and spend its time on its own domain instead.

A comprehensive **content engine** (define a content type as data, get storage/validation/lifecycle/UI) is built and proven end to end (see Status).

> **Building an app on GovCore?** Start with the [**Consumer Guide**](./docs/consumer-guide.md) — day-one-to-first-login plus the invariants (RLS, the two-role split, `govcore-setup`) that fail in ways whose symptoms don't point at the cause. For the full picture — the trust boundary, the seams, the package map — read the [**Architecture doc**](./docs/architecture.md).

## Status

**Shipped.** All 15 `@govcore/*` packages are implemented and **published to npm at `0.x`** (Changesets `release.yml`, `workflow_dispatch`). GovCore was extracted from the [GovEA](https://github.com/roballred/GovEA) codebase — GovEA is the app this platform plane came *from*, and is its first consumer. The content engine (`@govcore/content`) is built and proven: definition→Drizzle compiler, relationships and computed fields, lifecycle hooks, generated CRUD `tenantAction`s and React screens, taxonomy, and recipes — exercised by the DB-backed `examples/smoke` suite in CI and dogfooded in `examples/minimal-app`.

**GovEA cutover (consumer zero):** GovEA has adopted most of the platform plane from npm — RBAC, schema + `govcore-migrate`, tenancy guards, auth password flows, shared theming, and the product-plane `AppShell`. A few items remain, tracked in the GovEA repo: the auth two-role split ([#896](https://github.com/roballred/GovEA/issues/896)), `@govcore/content/screens` adoption ([#899](https://github.com/roballred/GovEA/issues/899)), and a last-admin guard fix ([#907](https://github.com/roballred/GovEA/issues/907)).

**Architecture is the source of truth:** [`docs/architecture.md`](./docs/architecture.md) — the trust boundary, the enforced request path, RLS + two-role DB, generic RBAC, the WCAG base theme, backup/restore, the package map, and the content engine, layered from concept to how-to-build.

## What it is (and isn't)

GovCore owns **tenants, identity, and trust** — "who can do what, in which org, and how do we prove it." It does **not** own any particular app's domain. An app brings its own entities (capabilities, permits, inspections…) and gets tenancy, auth, audit, and accessibility for free.

Packages (all implemented and published; see [architecture — the packages](./docs/architecture.md#the-packages-and-why-there-are-many)):

| Package | Responsibility |
|---|---|
| `@govcore/schema` | Platform tables + enums + migrations + `govcore-migrate` runner |
| `@govcore/tenancy` | Memberships, active-org resolution, org guards |
| `@govcore/rbac` | Generic role/permission machinery (`createRbac`) |
| `@govcore/auth` | Auth.js config factory, SSO guard, sessions |
| `@govcore/audit` | Append-only audit writer + trigger |
| `@govcore/federation` | Org connections + cross-org links + visibility |
| `@govcore/support` | Break-glass + act-as + instance admin |
| `@govcore/backup` | Whole-tenant export/restore to file |
| `@govcore/middleware` | Edge-safe Next middleware factory |
| `@govcore/theme` | WCAG-AA base theme + safe theming |
| `@govcore/server` | `tenantAction` + tenant transaction |
| `@govcore/setup` | First-run bootstrap: runtime-role provisioning + first org/admin |
| `@govcore/testing` | Test factories for consumers |
| `@govcore/nextkit` | UI primitives + reusable instance-console React + `AppShell` |
| `@govcore/content` | Content engine (type-def → tables, lifecycle, taxonomy, recipes) |

## Opinionated stack

GovCore assumes one stack and ships batteries-included for it:

- **App:** Next.js App Router, React, TypeScript
- **Database:** PostgreSQL with Drizzle ORM (tenant isolation enforced by Row-Level Security)
- **Auth:** Auth.js (local credentials + OIDC SSO)
- **UI:** Tailwind CSS + shadcn/ui, on a WCAG-AA base theme

An app on a different stack is out of scope by design — that is the trade for batteries-included reuse.

## Development

Prerequisites: Node.js 20+, pnpm 9+, and Podman or Docker for a local Postgres.

```bash
pnpm install
```

> **Note:** database-backed tests run in CI (the maintainer machine has no local Postgres). The platform layer is **migration-based** (`govcore-migrate`), not `db:push` — see [architecture — schema ownership](./docs/architecture.md#schema-ownership-two-migration-streams-one-database).

## Relationship to GovEA

GovCore is a **standalone initiative** with its own repository, backlog, and release lifecycle. GovEA depends on it as a normal versioned dependency — there is no submodule and no shared monorepo. Work happens in GovCore without touching GovEA.

## License

MIT — see [LICENSE](./LICENSE).
