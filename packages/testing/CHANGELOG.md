# @govcore/testing

## 0.1.0

### Minor Changes

- Add `@govcore/testing`: factories and helpers for exercising GovCore against a
  real Postgres — `createTestDb`, `createTestOrg` / `createTestUser` /
  `addMembership`, and `withTenant` (runs a callback inside a transaction with the
  `app.current_org` GUC set, so RLS policies apply under a non-owner role).

### Patch Changes

- Updated dependencies [f2f3743]
  - @govcore/schema@0.1.0
