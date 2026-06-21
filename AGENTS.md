# GovCore — Project Instructions for OpenAI Codex

> **Before any work, read [`docs/design/platform-core-extraction.md`](./docs/design/platform-core-extraction.md) and [`CLAUDE.md`](./CLAUDE.md) — they are authoritative and override this file.**

This is a Codex-specific pointer and guardrail layer. It does not replace the governing plan.

## What GovCore Is

A reusable, opinionated multi-tenant **platform core** for Next.js apps, published as `@govcore/*` packages (identity, tenancy, RBAC, audit, federation, support sessions, middleware, theming; a content engine later). A **standalone initiative**, separate from [GovEA](https://github.com/roballred/GovEA), which is its first consumer. **Do not modify GovEA from this repo.**

## Required Reading Order

1. [`docs/design/platform-core-extraction.md`](./docs/design/platform-core-extraction.md) — the governing plan: architecture, locked decisions, package layout, phased extraction, security hardening.
2. [`CLAUDE.md`](./CLAUDE.md) — operating policy: current state, database workflow, git/commit rules, what NOT to carry over from GovEA.

## Current State

This repo was seeded from a full copy of GovEA `main` as the extraction baseline, so most of it is **GovEA legacy** being carved into `@govcore/*` packages. `Standards.md`, `docs/AI-SESSION-START.md`, `business-architecture/`, and `apps/govea/` are inherited-from-seed, not GovCore canon — extract from or delete them; don't treat them as policy.

## Branch & PR Hygiene

- Start from current `origin/main`; never revive an old branch. One concern per PR.
- Humans merge PRs. Never push directly to `main`, force-push `main`, or bypass hooks.
- Platform schema changes use migrations (`govcore-migrate`), **not** `db:push`. Never reintroduce GovEA's pre-production push flow for platform tables.

## Scope Discipline

Keep each branch/PR focused. No opportunistic refactors, operator/deploy topology, or `.env` files. Before opening a PR, verify the diff contains only intended files; if unexpected files appear, stop and remove them.

## Not Applicable Here

GovEA's product process does **not** apply to GovCore: no Azure deploy rules, no EasyEA issue → capability → persona pre-flight, no GovEA milestones/ARB. GovCore defines its own lightweight traceability when it needs one; until then the design doc + `CLAUDE.md` are the working agreement.
