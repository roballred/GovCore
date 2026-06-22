# GovCore packages

Versioned `@govcore/*` packages that make up the platform core. The authoritative
design is [`docs/design/platform-core-extraction.md`](../docs/design/platform-core-extraction.md)
(see §3 for the layout, §9/§12 for the phase order).

## Scaffolded now (Phase 0–2 foundation)

| Package | Responsibility | Phase |
|---|---|---|
| `@govcore/schema` | Platform tables, enums, migrations, `govcore-migrate` runner — **implemented** | 1 |
| `@govcore/rbac` | Generic role/permission machinery (`createRbac`) — **implemented** | 0 |
| `@govcore/audit` | Append-only audit writer (trigger ships in `@govcore/schema`) — **implemented** | 2 |
| `@govcore/tenancy` | Active-org resolution + membership/org guards — **implemented** | 2 |
| `@govcore/testing` | Test factories (`createTestDb`/`Org`/`User`, `addMembership`, `withTenant`) — **implemented** | 0+ |

An end-to-end smoke harness lives in `examples/smoke` (`pnpm smoke` with `DATABASE_URL` set): it
runs `govcore-migrate` then exercises rbac/tenancy/audit, the audit-immutability trigger, and RLS
isolation under a non-owner role.

## Created when their phase begins

To avoid hollow packages, these are scaffolded at the start of their phase rather than now:

| Package | Responsibility | Phase |
|---|---|---|
| `@govcore/auth` | `createAuth` factory, SSO guard, password, sessions — **implemented** | 3 |
| `@govcore/middleware` | Edge-safe `createMiddleware` factory — **implemented** | 3 |
| `@govcore/federation` | Org connections, cross-org links, visibility | 4 |
| `@govcore/support` | Break-glass + act-as + instance admin | 4 |
| `@govcore/backup` | Whole-tenant export/restore to file | 4 |
| `@govcore/theme` | WCAG-AA base theme + safe theming | 4 |
| `@govcore/server` | `tenantAction` + tenant transaction | 4 |
| `@govcore/nextkit` | UI primitives + reusable instance-console React | 4 |
| `@govcore/content` | Content engine (define-a-type-as-data) | Second milestone (Appendix B) |

## Legacy

The GovEA seed (including `packages/core` / `@govea/core`, `apps/govea`, and the
EA domain) has been removed — this is now a clean, packages-only monorepo. Code
still to be ported in later phases is read from the sibling GovEA repo.

## Conventions

- Source-first during development: `main`/`types`/`exports` point at `src/index.ts`; `pnpm build` (tsc) emits `dist/` + declarations. Published `exports` flip to `dist` at the 1.0 cut (design §9 Phase 5).
- Each package extends the root [`tsconfig.base.json`](../tsconfig.base.json).
- `@govcore/schema`, `@govcore/rbac`, and `@govcore/theme` must stay **edge-safe / DB-free** so they can be imported into Next middleware (design §3, §13.1).
- Every change to a `@govcore/*` package needs a changeset (`pnpm changeset`).
