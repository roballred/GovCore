# @govcore/server

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
