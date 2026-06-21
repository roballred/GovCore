# GovCore — Project Instructions for Claude

> **Governing plan:** [`docs/design/platform-core-extraction.md`](./docs/design/platform-core-extraction.md) is the source of truth for GovCore — architecture, locked decisions, package layout, the phased extraction plan, and security hardening. Read it before doing anything. If anything here conflicts with it, the design doc governs.

## What This Is

GovCore is a reusable, opinionated **multi-tenant platform core** for Next.js apps, published as versioned `@govcore/*` packages: identity, organizations, memberships + active-org resolution, RBAC, audit, federation, support-access (break-glass / act-as), middleware, theming, and (second milestone) a content engine. It owns *tenants, identity, and trust* — not any app's domain.

It is a **standalone initiative**, separate from [GovEA](https://github.com/roballred/GovEA). GovEA is the app this platform plane is being extracted from and is GovCore's first consumer; it depends on GovCore as a normal versioned dependency. **Do not modify GovEA from this repo.**

- **Repo:** https://github.com/roballred/GovCore
- **Local:** `/Users/robbot/Repos/Claude/GovCore` (peer to `govea-app`)

## Current State — read this before editing

This repo was **seeded from a full copy of GovEA `main`** (commit `19b4bdf`) as the extraction baseline. So right now it *is* the GovEA codebase. The work is to carve the reusable platform plane out into `@govcore/*` packages and remove the GovEA-specific domain, per the design doc's phased plan.

That means much of what's here is **GovEA legacy inherited from the seed, not GovCore canon yet** — including `Standards.md`, `docs/AI-SESSION-START.md`, `business-architecture/`, `apps/govea/`, and the EasyEA capability/persona model. Treat those as material to extract-from or delete, not as governing GovCore policy. The design doc is the policy.

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
