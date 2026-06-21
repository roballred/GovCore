---
"@govcore/rbac": minor
---

Add the generic `createRbac` factory: typed role/permission machinery
parameterized over an app-supplied role/permission map (`hasPermission`,
`roleAtLeast`, `permissionsFor`, `topRole`, ordered `roles`). Dependency-free
and edge-safe. GovEA's `admin/contributor/viewer` map is the first worked
example (built in `@govea/core`).
