# @govcore/rbac

## 0.1.0

### Minor Changes

- 5fc68f9: Add the generic `createRbac` factory: typed role/permission machinery
  parameterized over an app-supplied role/permission map (`hasPermission`,
  `roleAtLeast`, `permissionsFor`, `topRole`, ordered `roles`). Dependency-free
  and edge-safe. GovEA's `admin/contributor/viewer` map is the first worked
  example (built in `@govea/core`).
