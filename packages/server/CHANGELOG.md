# @govcore/server

## 0.3.2

### Patch Changes

- Updated dependencies [e3b0b97]
  - @govcore/audit@0.2.0

## 0.3.1

### Patch Changes

- Updated dependencies [f993e42]
  - @govcore/schema@0.4.0
  - @govcore/audit@0.1.4

## 0.3.0

### Minor Changes

- c9ae7c1: Organization lifecycle: suspend / reinstate / archive, enforced (#69).

  Lifecycle was unmodeled — the only escape hatch was `organizations.metadata`, which nothing enforced. It's now first-class and gated at the platform layer.

  - **`@govcore/schema`** — `organizations` gains `status` (`active | suspended | archived`, default `active`) plus `status_reason` / `status_changed_at` / `status_changed_by` (migration `0003`). Exports `ORGANIZATION_STATUSES`, the `OrganizationStatus` type, and the pure `isOrganizationActive(status)`. `metadata` is documented as the app's extension bag only — lifecycle no longer lives there.
  - **`@govcore/tenancy`** — `suspendOrganization` (reason required), `reinstateOrganization` (back to `active`, clears the reason), and `archiveOrganization` (soft-delete; data retained — a hard delete is a `@govcore/backup` export-then-purge concern). Each stamps who/when and audits `platform.org.suspend` / `reinstate` / `archive`.
  - **`@govcore/server`** — `createTenantActions` now gates on org status: a suspended/archived org runs **no** tenant transaction regardless of the actor's permissions. New optional `onOrgInactive(status)` hook (default throws `Organization is <status>`) so the app can route to a dedicated page. `organizations` isn't RLS-bound, so the check reads on the runtime pool.
  - **`@govcore/auth`** — `createAuth` denies a session whose resolved active org is suspended/archived: blocked at login and dropped within the 5-minute re-validation window.

  Additive — with the default `active` status, existing consumers see no behavior change. Not yet modeled: multi-org "skip the suspended org, resolve the next active membership" (today a session bound to a suspended org is denied rather than re-homed).

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

- f45843c: The operator/identity plane: fix the two-role login wall and name the operator seam (#57).

  `createAuth` gains an `authDb` option. Under the two-role split the runtime `db` connects as a non-owner, so `govcore.users`/memberships are FORCE-RLS-filtered by the `app.current_org` GUC — which cannot exist before a session does, so a credentials login finds zero rows and fails with `CredentialsSignin`. `authDb` is the identity-plane pool (a superuser or `BYPASSRLS` role — FORCE binds even the owner) that createAuth uses for the adapter, credentials lookup, SSO-provisioning check, membership resolution, and login/logout audit. Defaults to `db`, so single-role/dev setups are unchanged; two-role consumers stop reinventing an `authDb`/`platformDb` convention to get past login.

  `@govcore/server` gains `createOperatorActions` — the operator-plane counterpart to `createTenantActions`. Where `tenantAction` runs on the runtime pool, sets the org GUC, and gates by an RBAC permission, `operatorAction` runs on the privileged pool, sets **no** org GUC (cross-org by design), and gates by `instanceRole` (default `instance_admin`, exported as `INSTANCE_ADMIN_ROLE`). It hands the handler the privileged db plus an audit writer pre-bound to the operator — so a consumer's ad-hoc `platformDb.select(...)` becomes a named, instance-admin-gated seam the gate can't be forgotten on. Composes the #63 console mutations (`createOrganization`, `updateUserAdministration`, …), which manage their own transactions.

## 0.1.2

### Patch Changes

- Updated dependencies [d255afc]
  - @govcore/schema@0.2.0
  - @govcore/audit@0.1.1

## 0.1.1

### Patch Changes

- f3bce48: `createTenantActions` now accepts a `createRbac()` instance for its `rbac` gate without a cast. `CreateTenantActionsConfig.rbac.hasPermission` is declared with method syntax so its bivariant parameters accept a gate typed with the app's role/permission _literals_ (what `@govcore/rbac` returns), while the active role is checked as a `string`. Removes a consumer footgun (#45).

## 0.1.0

### Minor Changes

- 8db62da: Phase 4 (part 1) — the action seam and the accessibility floor.

  `@govcore/server`: `createTenantActions` → a typed `tenantAction` wrapper. It
  resolves the actor's active context (never trusting caller input), applies an
  optional permission gate, opens a transaction and sets the transaction-local
  `app.current_org` GUC so the schema's RLS policies bind to every query, and hands
  the handler an `audit` fn pre-bound to the actor + org.

  `@govcore/theme`: a WCAG-AA base token set (`base.css`, light/dark, visible focus
  ring), a Tailwind `baseTheme` preset, and `defineTheme` — which only allows
  overriding allowlisted brand vars and sanitizes values to prevent inline-`<style>`
  breakout (#769).

### Patch Changes

- Updated dependencies
- Updated dependencies [f2f3743]
  - @govcore/audit@0.1.0
  - @govcore/schema@0.1.0
