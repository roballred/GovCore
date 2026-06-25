# GovEA Cutover Runbook — adopting `@govcore/*`

How GovEA (consumer zero) migrates off `@govea/core` + `db:push` onto the published
`@govcore/*` packages. This guide is authored in GovCore as the adoption reference;
the work itself happens in the **GovEA repo** (`/Users/robbot/Repos/Claude/govea-app`).

> See also: design doc [§7 (how a new app consumes GovCore)](./design/platform-core-extraction.md),
> [§9 (the phased extraction plan)](./design/platform-core-extraction.md), and Appendix A
> (file-by-file inventory). This runbook is the GovEA-specific execution of §9.

## Preconditions

- **GovCore is published** as `0.x` to the `@govcore` scope (requires the `NPM_TOKEN`
  secret + `NPM_PUBLISH=true` to be set — see `.github/workflows/release.yml`). GovEA
  consumes pinned `0.x` prereleases during the cutover, then `^1.0` once GovCore cuts 1.0.
- **GovEA is not in production.** This relaxes the hardest part of §9: there is no live
  data to reconcile, so the platform-table migration cutover is a **clean rebuild**
  (drop the dev DB, re-create from `govcore-migrate`), not a careful in-place migration.
- The cutover is **incremental and reversible** — each phase ships behind thin re-export
  shims (the pattern GovEA's `lib/rbac.ts` already uses for `@govea/core`), so GovEA stays
  green throughout. Revert a phase by reverting its shim.

## What core owns vs. what GovEA keeps

| GovEA owns (stays in the app) | Core owns (re-export from `@govcore/*`) |
|---|---|
| Domain tables: capabilities, goals, objectives, initiatives, strategies, applications, services, personas, value-streams, adrs, principles, glossary, architecture-debt, data-architecture, taxonomy terms, custom fields, … | Platform tables: `organizations`, `users`, `user_organization_memberships`, `audit_log`, `org_connections`, `cross_org_links`, `break_glass_sessions`, `act_as_sessions` |
| Domain server actions + UI, the traceability/completeness/impact logic | Identity (local + OIDC), active-org resolution, RBAC, audit, middleware, break-glass/act-as, backup engine, base theme |
| Entity-specific cross-org link semantics (which entities link, how a federated capability resolves) | The cross-org link machinery + visibility |
| Brand themes (`govea`, `servicenow`) | The WCAG-AA base theme they layer on |

## File → package mapping (GovEA `apps/govea/src/`)

| GovEA file(s) | Replace with |
|---|---|
| `lib/rbac.ts` (wraps `@govea/core/rbac`) | `@govcore/rbac` `createRbac(...)` |
| `lib/audit.ts`, `lib/audit-view.ts` | `@govcore/audit` |
| `lib/auth.ts`, `lib/auth.config.ts`, `lib/auth-redirect.ts` | `@govcore/auth` `createAuth(...)` |
| `lib/password.ts` | `@govcore/auth/password` |
| `middleware.ts` | `@govcore/middleware` `createMiddleware(...)` |
| `lib/federation.ts` | `@govcore/federation` (keep entity-specific glue app-side) |
| `lib/break-glass.ts`, `lib/act-as.ts`, `lib/support-tiers.ts` | `@govcore/support` |
| `lib/backup-export.ts`, `lib/backup-import.ts` | `@govcore/backup` + `registerBackupTables([...domain tables])` |
| `lib/themes.ts` | `@govcore/theme` base + GovEA brand layers |
| `db/schema/{organizations,users,audit,federation,break-glass-sessions,act-as-sessions}.ts` | re-export from `@govcore/schema`; delete the local definitions |
| `@govea/core/{content-types,taxonomy,recipes,workflow}` | `@govcore/content` (the engine) — see Phase 5 |
| `db/scripts/apply-triggers.ts` (+ `db:apply-triggers`) | **delete** — core's migrations include the audit-immutability trigger, RLS, and the two-role setup |

---

## Phase 0 — Add the dependency + move RBAC first (lowest risk)

The pure, DB-free move — exactly how GovCore itself started (§9 Phase 0).

1. Add `@govcore/*` `0.x` to `apps/govea/package.json` (peers `next`/`drizzle-orm`/`next-auth`
   are already present).
2. Build the RBAC instance from GovEA's existing role map:
   ```ts
   // apps/govea/src/lib/rbac.ts
   import { createRbac } from '@govcore/rbac'
   export const rbac = createRbac({ rolePermissions: ROLE_PERMISSIONS, hierarchy: ROLE_HIERARCHY })
   // keep the User-shaped convenience wrappers + isInstanceAdmin; source Role/Permission
   // from the createRbac instance, not local constants.
   ```
   Repoint the `rbac-single-source` integration test at `@govcore/rbac`.
3. **Verify:** `rbac-single-source` passes; type-check green.

## Phase 1 — Schema re-export + the migration cutover (the pivotal step)

1. In `apps/govea/src/db/schema/index.ts`, **re-export** the core platform tables and
   **delete** the local files for them:
   ```ts
   export * from '@govcore/schema' // organizations, users, memberships, audit_log, org_connections, cross_org_links, break_glass_sessions, act_as_sessions
   ```
   Domain tables keep FK-ing to the re-exported `organizations` via `orgScoped(organizations)`.
2. Switch the platform layer from `db:push` to migrations — core first, then app domain:
   ```jsonc
   // apps/govea/package.json
   "db:migrate": "govcore-migrate && drizzle-kit migrate"
   ```
   Drop `db:push` for platform tables (domain tables may keep `db:push` short-term, or move
   to `drizzle-kit generate`/`migrate`).
3. **Clean rebuild (the not-in-prod win):** drop the dev/CI database and recreate it from
   `govcore-migrate` (platform) + `drizzle-kit migrate` (domain). No in-place reconciliation,
   no `CORE_SCHEMA_VERSION` baseline gymnastics.
4. **Delete `apply-triggers`** — the audit-immutability trigger, RLS policies, the `govcore.*`
   schema namespace, and the two-role (owner/runtime) split now ship in core's migrations.
5. **RLS on GovEA domain tables (net-new work — call it out):** core enforces RLS on the
   *platform* tables. GovEA's domain tables (`capabilities`, …) need their own RLS policies
   on the `app.current_org` GUC, applied as app-owned `drizzle-kit` migration steps using the
   same pattern core uses (`ENABLE`/`FORCE ROW LEVEL SECURITY` + an org-isolation policy).
   This is the largest net-new task in the cutover; until done, those tables rely on
   app-level `organizationId` filtering.
6. **Verify (CI — GovEA has no local Postgres either):** `govcore-migrate` builds the platform
   schema from clean; the audit trigger is present; an RLS cross-org-denial integration test
   passes; `drizzle-kit migrate` applies the domain tables on top.

## Phase 2 — Audit + tenancy shims

1. `lib/audit.ts` / `lib/audit-view.ts` → re-export `@govcore/audit` (`writeAuditLog`,
   `listAuditForOrg`, the audit view).
2. Replace the local `resolveActiveMembership` + membership guards with `@govcore/tenancy`
   re-exports. GovEA's `lib/*` become thin shims (same shape as today's `lib/rbac.ts`).
3. **Verify:** existing audit + multi-org integration tests pass unchanged.

## Phase 3 — Auth + middleware (highest review scrutiny)

The security edge cases live here — do this phase behind the strictest review.

1. `lib/auth.ts` / `lib/auth.config.ts` → `createAuth(...)` from `@govcore/auth`, injecting
   GovEA's providers + secrets + `ssoGuard`. Preserve the #782 resurrection guard, #720,
   #759, #807 behaviors (the GovCore `@govcore/auth` carries these).
2. `apps/govea/src/middleware.ts` → `createMiddleware({ publicPaths, instanceOnlyPaths })`
   from `@govcore/middleware` (preserves ADR-0003). **Keep `config.matcher` inline** — Next
   statically parses it and rejects an imported binding (mirror `@govcore/middleware`'s
   `defaultMatcher` value, per the minimal-app's middleware note).
3. `lib/password.ts` → `@govcore/auth/password`.
4. **Verify:** the full e2e auth / logout / resurrection / maintenance suites pass.

## Phase 4 — Federation + support + backup + theme + `tenantAction`

1. `lib/federation.ts` → `@govcore/federation` (org connections + visibility + the cross-org
   link lifecycle). Keep GovEA's **entity-specific** link glue (capability/persona resolution,
   enterprise/audit views) app-side.
2. `lib/break-glass.ts`, `lib/act-as.ts`, `lib/support-tiers.ts` → `@govcore/support`.
3. `lib/backup-export.ts` / `lib/backup-import.ts` → `@govcore/backup`;
   `registerBackupTables([...all GovEA domain tables])`. **Verify an export/restore round-trip
   matches pre-cutover behavior.**
4. `lib/themes.ts` → layer GovEA's `govea`/`servicenow` brand themes on the `@govcore/theme`
   base preset (`tailwind.config.ts` presets).
5. Migrate GovEA's ~40 action files onto `tenantAction` (`@govcore/server`) incrementally —
   the per-file `requireContributor`/`requireAdmin` wrappers collapse into the one wrapper,
   which resolves the active org from the trusted session, opens the RLS-bound transaction,
   and audits in-transaction. Pass GovEA's `createRbac` instance straight in as the gate
   (no cast — `@govcore/server` ≥ the #45 fix). Actions keep working via shims until migrated.

## Phase 5 — Content engine (later) + retire `@govea/core`

1. **Content engine is optional and not a cutover prerequisite.** `@govea/core`'s
   `content-types`/`taxonomy`/`recipes`/`workflow` stubs are superseded by `@govcore/content`
   (the full engine, proven on Capability by the spike). Migrating GovEA's entity *definitions*
   onto the engine is the long-tail (§ Appendix B sequencing: glossary → principles → the
   relational chain), done after the platform cutover.
2. Once every `lib/*` shims to `@govcore/*` and `@govea/core` has no remaining unique exports,
   **delete `packages/core` and drop the `@govea/core` dependency**.
3. When GovCore cuts `1.0`, move GovEA's `@govcore/*` ranges from `0.x` prereleases to pinned
   `^1.0` and retire any remaining shims.

---

## Verification strategy (no local Postgres — both repos are CI-DB)

- Every phase is independently shippable and reversible (revert the shim, keep the app code).
- DB-backed checks (migration build, RLS cross-org denial, integration round-trips) run in CI,
  matching how both GovCore and GovEA already test.
- Recommended gate order per phase: type-check → unit → the phase's targeted integration suite.

## Risks & call-outs

- **RLS on GovEA's domain tables (Phase 1.5)** is the biggest net-new task — core only owns
  platform-table RLS. Budget for adding org-isolation policies to every domain table.
- **Auth/middleware (Phase 3)** carries the security edge cases — highest scrutiny, do it alone.
- **Backup round-trip (Phase 4.3)** must match pre-cutover behavior exactly before trusting it.
- **Inline middleware matcher** — Next's segment-config parser rejects an imported matcher value.
- **Publishing must be enabled first** — GovEA can't depend on unpublished packages.
