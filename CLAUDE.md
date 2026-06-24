# GovCore — Project Instructions for Claude

> **Governing plan:** [`docs/design/platform-core-extraction.md`](./docs/design/platform-core-extraction.md) is the source of truth for GovCore — architecture, locked decisions, package layout, the phased extraction plan, and security hardening. Read it before doing anything. If anything here conflicts with it, the design doc governs.

## What This Is

GovCore is a reusable, opinionated **multi-tenant platform core** for Next.js apps, published as versioned `@govcore/*` packages: identity, organizations, memberships + active-org resolution, RBAC, audit, federation, support-access (break-glass / act-as), middleware, theming, and (second milestone) a content engine. It owns *tenants, identity, and trust* — not any app's domain.

It is a **standalone initiative**, separate from [GovEA](https://github.com/roballred/GovEA). GovEA is the app this platform plane is being extracted from and is GovCore's first consumer; it depends on GovCore as a normal versioned dependency. **Do not modify GovEA from this repo.**

- **Repo:** https://github.com/roballred/GovCore
- **Local:** `/Users/robbot/Repos/Claude/GovCore` (peer to `govea-app`)

## Current State — read this before editing

GovCore was seeded from GovEA `main` (commit `19b4bdf`) and the **GovEA-specific seed has now been stripped** — no `apps/govea`, no `@govea/core`, no `business-architecture/`, `Standards.md`, GovEA docs, scripts, docker, or CI. What remains is a clean, packages-only monorepo: the `@govcore/*` packages, the design doc, and tooling.

**Implemented (platform plane v1):** `@govcore/rbac` (generic `createRbac`), `@govcore/schema` (platform tables in the `govcore` Postgres schema + migrations + `govcore-migrate` + RLS), `audit`, `tenancy`, `auth`, `middleware`, `server`, `theme` (WCAG-AA base theme), `nextkit` (reusable instance-console React), `support` (break-glass + act-as), `federation` (org connections + visibility **+ the cross-org content-link lifecycle**, #18), and `backup` (registration-based whole-tenant export/restore **+ cross-org clone with UUID remapping**, #20).

**Implemented (Milestone 2 — the content engine, `@govcore/content`):** the full engine is built and proven. The four Appendix B seeds plus relationships, computed fields, and per-type hooks are all real: the definition→Drizzle compiler (Rule 1), `reference`/`link` relationships + computed fields (Rule 2), `beforePublish`/`afterChange` hooks (Rule 3), generated CRUD `tenantAction`s, generated React screens (the `@govcore/content/screens` subpath), taxonomy binding (`buildTree` + the engine-owned `taxonomy_nodes` table), and recipes (`applyRecipe` — installable per-org bundles). Proven end to end on GovEA's richest entity by the **Capability spike** (`examples/smoke/capability.ts`), whose generated table is indistinguishable from the hand-written `capabilities` table. Migrating GovEA's actual entities onto the engine is the app-side long-tail and has not started.

**App-side by design (not missing core work):** the *entity-specific* cross-org link semantics — which entity types link and how a federated capability/persona is resolved/displayed — live in the consuming app (GovEA owns "what a Capability is"); core provides the link machinery. No platform-plane features remain deferred.

**Extraction source for the content engine:** the remaining platform code still to be ported lives in the **sibling GovEA repo at `/Users/robbot/Repos/Claude/govea-app`** (read-only — never modify it). Read `apps/govea/src/lib/*` there as the source.

**Verification:** there is a test harness. **Vitest** unit suites (pure logic — password, theme, support, federation visibility, backup registry/import, the #782 resurrection guard, etc.) run locally. **`examples/smoke`** runs a DB-backed integration round-trip — migrate, rbac/tenancy/audit, the audit-immutability trigger, RLS tenant isolation under a non-owner role, the support lifecycle, federation connections, a backup round-trip, **and the full content engine (compiled RLS tables, relationships, computed fields, hooks, generated actions, taxonomy, recipes, and the Capability spike)** — against Postgres in CI (`.github/workflows/ci.yml`). CI also runs the **edge-safety gate** (`pnpm check:edge`, §575). There is no local Postgres, so the DB-backed smoke runs in CI; unit suites run anywhere after `pnpm install`.

## Locked Decisions (summary — full detail in the design doc)

- **Separate repo, opinionated stack:** Next.js App Router + Drizzle + PostgreSQL + Auth.js. Other stacks are out of scope.
- **Core owns the platform tables and their migrations.** Migration-based **from day one** (`govcore-migrate`) — *not* `db:push`.
- **Tenant isolation is database-enforced:** Postgres Row-Level Security + a transaction-local org GUC, plus a two-role DB (owner/DDL vs. non-owner runtime). All tenant DB access runs inside a tenant transaction.
- **Generic RBAC:** `createRbac` parameterized over an app-supplied role/permission map (GovEA's `admin/contributor/viewer` map is the default).
- **WCAG-AA base theme** as the accessibility floor; apps add brand themes on top.
- **Whole-tenant backup/restore to file** (JSON for now).
- **Content engine** (`@govcore/content`) is the second milestone, built after the platform-plane v1.

## Database Workflow

The platform layer is **migration-based from day one** — author migrations in `@govcore/schema` and apply them with `govcore-migrate`. Do **not** reintroduce GovEA's pre-production `db:push --force` flow for platform tables.

DB-level constraints that Drizzle doesn't manage (e.g. the append-only `audit_log` trigger) ship as raw-SQL migration steps, not a separate apply-triggers pass.

**No local Postgres on the maintainer machine** — database-backed tests run in CI. Lean on CI for migration builds, RLS cross-org-denial tests, and integration tests.

## Git & Commits

- Commit identity is set repo-locally to **Rob Allred `<roballred@hotmail.com>`** (already configured; do not let commits land as RobBot).
- Humans merge PRs. Don't push directly to `main`, don't force-push `main`, don't bypass hooks (`--no-verify`).
- Don't commit secrets or `.env.local`.

## What NOT to carry over from GovEA

These were GovEA's *product* process and operator topology — they are **not** GovCore's:

- Azure / `scripts/azure-dev.sh` deployment rules and any operator-specific identifiers.
- The EasyEA issue → capability → persona → acceptance-criteria pre-flight, and GovEA milestones/ARB. GovCore will define its own (lightweight) traceability once it needs one; until then, the design doc + this file are the working agreement.
- GovEA's `db:push` pre-production database workflow (see above).

## Working Approach

Strangler-from-the-copy: extract the platform plane into `@govcore/*` packages incrementally, keeping the repo building at each step, following the phase order in the design doc (§9 / §12). Prove the content engine on one rich entity before generalizing (Appendix B). Until the GovCore repository's own backlog exists, **the design doc is the single planning record** — work breakdown lives there.
