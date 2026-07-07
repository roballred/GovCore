# @govcore/server

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
