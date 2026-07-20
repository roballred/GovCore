# GovCore — Project Instructions for Claude

> **Architecture:** [`docs/architecture.md`](./docs/architecture.md) is the source of truth for GovCore — the trust boundary, locked decisions, package layout, the enforced request path, and security hardening (RLS + two-role DB, generic RBAC, WCAG base theme, backup, content engine). Read it before doing anything. If anything here conflicts with it, the architecture doc governs.

## What This Is

GovCore is a reusable, opinionated **multi-tenant platform core** for Next.js apps, published as versioned `@govcore/*` packages: identity, organizations, memberships + active-org resolution, RBAC, audit, federation, support-access (break-glass / act-as), middleware, theming, and a content engine. It owns *tenants, identity, and trust* — not any app's domain.

It is a **standalone initiative**, separate from [GovEA](https://github.com/roballred/GovEA). GovEA is the app this platform plane was extracted from and is GovCore's first consumer; it depends on GovCore as a normal versioned dependency. **Do not modify GovEA from this repo.**

- **Repo:** https://github.com/roballred/GovCore
- **Local:** `/Users/robbot/Repos/Claude/GovCore` (peer to `govea-app`)

## Current State — read this before editing

GovCore is a **shipped, maintained platform**: a clean, packages-only monorepo with **all 15 `@govcore/*` packages implemented and published to npm at `0.x`**. It was originally seeded from GovEA and the GovEA-specific seed was stripped long ago — no `apps/govea`, no `@govea/core`, no `business-architecture/`, no GovEA docs/scripts/docker. Work now is maintenance and evolution, not extraction.

**Platform plane:** `rbac` (generic `createRbac`), `schema` (platform tables in the `govcore` Postgres schema + migrations + `govcore-migrate` + RLS), `audit`, `tenancy`, `auth`, `middleware`, `server` (`tenantAction`), `setup` (first-run bootstrap), `testing`, `theme` (WCAG-AA base), `nextkit` (instance-console React + product-plane `AppShell`), `support` (break-glass + act-as), `federation` (org connections + visibility + the cross-org content-link lifecycle), and `backup` (whole-tenant export/restore + cross-org clone with UUID remapping).

**Content engine (`@govcore/content`):** built and proven end to end. The definition→Drizzle compiler, `reference`/`link` relationships + computed fields, `beforePublish`/`afterChange` hooks, generated CRUD `tenantAction`s, generated React screens (the `@govcore/content/screens` subpath), taxonomy binding (`buildTree` + the engine-owned `taxonomy_nodes` table), and recipes (`applyRecipe`) are all real — verified by the Capability spike (`examples/smoke/capability.ts`), whose generated table is indistinguishable from a hand-written one. Migrating a consuming app's actual entities onto the engine is app-side work.

**App-side by design (not missing core work):** the *entity-specific* cross-org link semantics — which entity types link and how a federated capability/persona is resolved/displayed — live in the consuming app (GovEA owns "what a Capability is"); core provides the link machinery. No platform-plane features remain deferred.

**The sibling GovEA repo** at `/Users/robbot/Repos/Claude/govea-app` is GovCore's consumer-zero reference — **read-only, never modify it from here.** Read `apps/govea/src/*` there when you need to see how a real consumer wires a package.

**Verification:** **Vitest** unit suites (pure logic — password, theme, support, federation visibility, backup registry/import, the resurrection guard, etc.) run locally. **`examples/smoke`** runs a DB-backed integration round-trip — migrate, rbac/tenancy/audit, the audit-immutability trigger, RLS tenant isolation under a non-owner role, the support lifecycle, federation connections, a backup round-trip, **and the full content engine** — against Postgres in CI (`.github/workflows/ci.yml`). CI also runs the **edge-safety gate** (`pnpm check:edge`). There is no local Postgres, so the DB-backed smoke runs in CI; unit suites run anywhere after `pnpm install`.

## Locked Decisions (summary — full detail in [`docs/architecture.md`](./docs/architecture.md#status--decisions))

- **Separate repo, opinionated stack:** Next.js App Router + Drizzle + PostgreSQL + Auth.js. Other stacks are out of scope.
- **Core owns the platform tables and their migrations.** Migration-based (`govcore-migrate`) — *not* `db:push`.
- **Tenant isolation is database-enforced:** Postgres Row-Level Security + a transaction-local org GUC, plus a two-role DB (owner/DDL vs. non-owner runtime). All tenant DB access runs inside a tenant transaction.
- **Generic RBAC:** `createRbac` parameterized over an app-supplied role/permission map (GovEA's `admin/contributor/viewer` map is the default).
- **WCAG-AA base theme** as the accessibility floor; apps add brand themes on top.
- **Whole-tenant backup/restore to file** (JSON for now).
- **Content engine** (`@govcore/content`) compiles type definitions into real Drizzle tables + migrations.

## Database Workflow

The platform layer is **migration-based from day one** — author migrations in `@govcore/schema` and apply them with `govcore-migrate`. Do **not** reintroduce GovEA's pre-production `db:push --force` flow for platform tables.

DB-level constraints that Drizzle doesn't manage (e.g. the append-only `audit_log` trigger) ship as raw-SQL migration steps, not a separate apply-triggers pass.

**No local Postgres on the maintainer machine** — database-backed tests run in CI. Lean on CI for migration builds, RLS cross-org-denial tests, and integration tests.

## Git & Commits

- Commit identity is set repo-locally to **Rob Allred `<roballred@hotmail.com>`** (already configured; do not let commits land as RobBot).
- Humans merge PRs. Don't push directly to `main`, don't force-push `main`, don't bypass hooks (`--no-verify`).
- Don't commit secrets or `.env.local`.

## Pre-Flight Checklist — Required Before Writing Any Code

Same methodology as GovEA. Before implementing anything, work through every item below in order. If any item cannot be satisfied, stop and resolve it before proceeding. Do not start implementation to "figure it out as you go."

### 1. Issue exists
A GitHub issue must exist with defined scope and acceptance criteria. If the user hands me a task informally (chat message, verbal request), I must **create the issue first** and confirm its content before writing code. No exceptions.

### 2. Traceability is present
GovCore is a platform library, so its traceability anchor is the **architecture doc + the affected package**, not GovEA's EasyEA capability IDs/personas. The issue must name:
- The `@govcore/*` package(s) it touches, and
- The [`docs/architecture.md`](./docs/architecture.md) area it belongs to. If the work is new architecture not reflected there, **update the architecture doc first** (or in the same PR) — the architecture doc governs.

### 3. Consumer rationale is identified
Name the consumer need the work serves (which consuming app or API surface — GovEA is consumer #0, GovCRM #2). GovCore's "users" are the consuming apps/developers; there are no personas. If a change can't be tied to a consumer requirement or an architecture decision, flag it and ask the user to confirm why it should exist. Do not assume the work is self-evidently justified.

### 4. Acceptance criteria + verification are clear
The issue should have enough detail to know when the work is done, including **which test tier proves it**: vitest unit suite (pure logic), `examples/smoke` (DB-backed, CI), and/or the `pnpm check:edge` gate. If acceptance criteria or the verification plan are missing or vague, ask before implementing.

## Traceability in Every Commit and PR

Every commit that touches implementation must reference the issue in the message body:

```
feat(content): base list-view contract in ContentListScreen

Architecture: content engine / generated screens (docs/architecture.md)
Closes #96
```

Every PR description must include:
- `Closes #N` referencing the issue
- The architecture-doc area / package the work maps to
- A short explanation of what changed, why, and **how it was verified** (which test tier)

This is not optional — it is the mechanism that makes AI-assisted work auditable and trustworthy.

## What NOT to carry over from GovEA

The *methodology* (issue-first + traceability, above) is shared. These GovEA *product* artifacts and operator specifics are **not** GovCore's:

- Azure / `scripts/azure-dev.sh` deployment rules and any operator-specific identifiers.
- EasyEA **capability docs, personas, and ARB review**, and GovEA milestones. GovCore has no `business-architecture/`, personas, or ARB — its traceability anchor is the architecture doc + issues (see Pre-Flight §2).
- GovEA's `db:push` pre-production database workflow (see above).

## Working Approach

GovCore is a shipped platform under maintenance: evolve it in small, independently-releasable, backwards-compatible changes, keeping the repo green at each step (typecheck, lint, edge-safety gate, `examples/smoke` in CI, the `examples/minimal-app` canary). Every change is a versioned package release consumers opt into — respect semver, and treat any platform-schema change as a migration (see Database Workflow). [`docs/architecture.md`](./docs/architecture.md) is the architectural source of truth; **GitHub issues are the working backlog** (each traced per the Pre-Flight checklist).
