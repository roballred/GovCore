# @govcore/support

## 0.2.3

### Patch Changes

- Updated dependencies [f993e42]
  - @govcore/schema@0.4.0
  - @govcore/audit@0.1.4

## 0.2.2

### Patch Changes

- Updated dependencies [c9ae7c1]
  - @govcore/schema@0.3.0
  - @govcore/audit@0.1.3

## 0.2.1

### Patch Changes

- fbd5dc1: Ship compiled builds — retire source-first packaging (#71, closes #56).

  Every package published `main: ./src/index.ts`, which pushed core's build internals onto consumers: internal type deps leaked (a consumer needed `@types/bcryptjs` just to typecheck `@govcore/auth`, #56), every Next.js app had to list all 14 packages in `transpilePackages`, and non-Next/Node consumers couldn't consume the TS source at all.

  Each package now builds with **tsup** to ESM + `.d.ts` + sourcemaps in `dist/`, with `exports`/`main`/`types` pointing at the compiled output and `files` limited to what ships (`dist`, plus `migrations/` for schema and `base.css` for theme). Intra-package modules are bundled; `dependencies`/`peerDependencies` (the other `@govcore/*` packages, drizzle, react, …) stay external. Multi-entry packages keep their subpaths compiled — `@govcore/auth/password`, `@govcore/content/screens`, `@govcore/schema/migrate`; the `govcore-migrate` bin still resolves `../migrations` from `dist/`.

  Non-breaking: a consumer that keeps `transpilePackages` for these keeps working (transpiling already-compiled ESM is a no-op) — but no longer needs it, or any of core's internal `@types`. Proven by the canary (`examples/minimal-app`) now building with an empty `next.config`, and by a CI build step so both the canary and the smoke resolve the compiled `dist/` rather than source.

- Updated dependencies [fbd5dc1]
  - @govcore/schema@0.2.1
  - @govcore/audit@0.1.2

## 0.2.0

### Minor Changes

- 2b7d55e: Support-session read/status layer + presentational surfaces (#67). `@govcore/support` shipped the break-glass/act-as _lifecycle_; every consumer additionally rebuilt the display status and the session queries — and nothing in core enabled the tenant-side visibility the model requires. Now:

  `@govcore/support` gains pure status helpers — `breakGlassStatus` (`active`/`pending`/`expired`/`revoked`, with revocation and expiry winning over a pending approval) and `actAsStatus` (`active`/`expired`/`ended`) — plus read helpers `listBreakGlassSessions`/`listActAsSessions` (newest-first; a `targetOrgId` scopes them to one org, which is the tenant-visibility query, or omit it for the operator console view) and `orgHasSupportHistory` for a cheap "has anyone accessed our data?" indicator.

  `@govcore/nextkit` gains the presentational surfaces over a `SupportSessionView` (ids resolved to labels, status derived by the consumer): `SupportSessionsTable`, `TenantSupportVisibility` (the org-admin panel that satisfies the "support access is visible to the affected org" rule, with a live-access warning and a reassuring healthy empty state), `ActAsBanner` (the audited-impersonation reminder with an optional End action), `BreakGlassGrantForm`, and `supportStatusTone` (maps a status to a Badge tone — `active` is `danger`, the state to draw the eye). nextkit now depends on `@govcore/support` for the status vocabulary.

  The lifecycle mutations already in `@govcore/support` are unchanged; the console _read-side wiring_ of these components is tracked in #78.

### Patch Changes

- Updated dependencies [d255afc]
  - @govcore/schema@0.2.0
  - @govcore/audit@0.1.1

## 0.1.0

### Minor Changes

- Phase 4 — `@govcore/support`: instance-operator support access.

  break-glass: `requireBreakGlass` / `getUnlockedOrgIds` gates and the audited
  `grantBreakGlass` / `approveBreakGlass` / `revokeBreakGlass` lifecycle (grants
  over the threshold require a second admin; TTL counts from grant time). act-as:
  `startActAsSession` / `requireActAs` / `getActiveActAsSession` /
  `endActAsSession` — framework-agnostic (the caller supplies the session id), with
  a child that can never outlive its parent and self-terminates on a parent revoke.

### Patch Changes

- Updated dependencies
- Updated dependencies [f2f3743]
  - @govcore/audit@0.1.0
  - @govcore/schema@0.1.0
