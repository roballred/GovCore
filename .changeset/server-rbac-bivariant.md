---
"@govcore/server": patch
---

`createTenantActions` now accepts a `createRbac()` instance for its `rbac` gate without a cast. `CreateTenantActionsConfig.rbac.hasPermission` is declared with method syntax so its bivariant parameters accept a gate typed with the app's role/permission *literals* (what `@govcore/rbac` returns), while the active role is checked as a `string`. Removes a consumer footgun (#45).
