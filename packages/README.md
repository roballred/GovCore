# GovCore packages

Versioned `@govcore/*` packages that make up the platform core. The authoritative
design is [`docs/design/platform-core-extraction.md`](../docs/design/platform-core-extraction.md)
(see §3 for the layout, §9/§12 for the phase order).

## Packages (all implemented, published to npm at `0.x`)

The phase column records extraction provenance (design §9/§12), not remaining work.

| Package | Responsibility | Phase |
|---|---|---|
| `@govcore/rbac` | Generic role/permission machinery (`createRbac`) | 0 |
| `@govcore/testing` | Test factories (`createTestDb`/`Org`/`User`, `addMembership`, `withTenant`) | 0+ |
| `@govcore/schema` | Platform tables, enums, migrations, `govcore-migrate` runner | 1 |
| `@govcore/audit` | Append-only audit writer (trigger ships in `@govcore/schema`) | 2 |
| `@govcore/tenancy` | Active-org resolution + membership/org guards | 2 |
| `@govcore/auth` | `createAuth` factory, SSO guard, password, sessions | 3 |
| `@govcore/middleware` | Edge-safe `createMiddleware` factory | 3 |
| `@govcore/federation` | Org connections, cross-org links + link lifecycle, visibility | 4 |
| `@govcore/support` | Break-glass + act-as + instance admin | 4 |
| `@govcore/backup` | Whole-tenant export/restore to JSON + cross-org clone | 4 |
| `@govcore/theme` | WCAG-AA base theme + safe theming | 4 |
| `@govcore/server` | `tenantAction` + tenant transaction | 4 |
| `@govcore/nextkit` | UI primitives + reusable instance-console React | 4 |
| `@govcore/content` | Content engine (define-a-type-as-data) | Second milestone (Appendix B) |

An end-to-end smoke harness lives in `examples/smoke` (`pnpm smoke` with `DATABASE_URL` set; runs
against Postgres in CI): it runs `govcore-migrate` then exercises rbac/tenancy/audit, the
audit-immutability trigger, RLS isolation under a non-owner role, the support lifecycle,
federation connections, a backup round-trip, and the full content engine (compiled RLS tables,
relationships, computed fields, hooks, generated actions, taxonomy, recipes, and the Capability
spike).

## Legacy

The GovEA seed (including `packages/core` / `@govea/core`, `apps/govea`, and the
EA domain) has been removed — this is now a clean, packages-only monorepo. The
sibling GovEA repo remains the read-only reference for migrating GovEA's entities
onto the content engine.

## Conventions

- Source-first during development: `main`/`types`/`exports` point at `src/index.ts`; `pnpm build` (tsc) emits `dist/` + declarations. Published `exports` flip to `dist` at the 1.0 cut (design §9 Phase 5).
- Each package extends the root [`tsconfig.base.json`](../tsconfig.base.json).
- `@govcore/schema`, `@govcore/rbac`, and `@govcore/theme` must stay **edge-safe / DB-free** so they can be imported into Next middleware (design §3, §13.1).
- Every change to a `@govcore/*` package needs a changeset (`pnpm changeset`).
