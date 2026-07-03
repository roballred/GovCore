# GovCore

**A reusable, opinionated multi-tenant platform core for Next.js apps.**

GovCore packages the hardened "platform plane" that every serious multi-tenant SaaS re-implements badly — identity, organizations, memberships and active-organization resolution, role-based access control, audit, federation, and support-access (break-glass / act-as) sessions — into versioned `@govcore/*` packages, so a new app can stand up a secure multi-tenant foundation in well under a day and spend its time on its own domain instead.

A comprehensive **content engine** (define a content type as data, get storage/validation/lifecycle/UI) — GovCore's second milestone — is built and proven end to end (see Status).

## Status

**Platform plane v1 implemented; GovEA cutover in progress.** This repository was seeded from the [GovEA](https://github.com/roballred/GovEA) codebase — GovEA is the app this platform plane was extracted *from*, and is GovCore's first consumer. All 14 `@govcore/*` packages are implemented and **published to npm at `0.x`** (Changesets `release.yml`, `workflow_dispatch`). The content engine (`@govcore/content`) is built and proven: definition→Drizzle compiler, relationships and computed fields, lifecycle hooks, generated CRUD `tenantAction`s and React screens, taxonomy, and recipes — exercised by the DB-backed `examples/smoke` suite in CI and dogfooded in `examples/minimal-app`.

**GovEA cutover status:** Phase 0 is done (`@govcore/rbac` consumed from npm; GovEA #886/#887) and GovEA's org-settings sidecar prep ("Phase 1a") is merged; the schema re-export + migration cutover is next. Runbook: [`docs/govea-cutover.md`](./docs/govea-cutover.md). Migrating GovEA's entities onto the content engine is app-side work and has not started.

**The plan is the source of truth:** [`docs/design/platform-core-extraction.md`](./docs/design/platform-core-extraction.md). Read it before doing anything here — it holds the architecture, the locked decisions, the package layout, the phased extraction plan, and the security hardening (RLS + two-role DB, generic RBAC, WCAG base theme, backup/restore, content engine).

## What it is (and isn't)

GovCore owns **tenants, identity, and trust** — "who can do what, in which org, and how do we prove it." It does **not** own any particular app's domain. An app brings its own entities (capabilities, permits, inspections…) and gets tenancy, auth, audit, and accessibility for free.

Packages (see design §3; all implemented and published):

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
| `@govcore/nextkit` | UI primitives + reusable instance-console React |
| `@govcore/content` | Content engine (second milestone) |

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

> **Note:** database-backed tests run in CI (the maintainer machine has no local Postgres). The platform layer is **migration-based from day one** (`govcore-migrate`), not `db:push` — see the design doc §5.

## Relationship to GovEA

GovCore is a **standalone initiative** with its own repository, backlog, and release lifecycle. GovEA depends on it as a normal versioned dependency — there is no submodule and no shared monorepo. Work happens in GovCore without touching GovEA.

## License

MIT — see [LICENSE](./LICENSE).
