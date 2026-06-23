# @govcore/backup

## 0.1.0

### Minor Changes

- Phase 4 — `@govcore/backup`: registration-based whole-tenant export/restore to
  JSON.

  The app declares its org-scoped tables in dependency order via
  `registerBackupTables`; `exportOrg` extracts one org's rows into a
  JSON-serializable bundle (recipe / content / archive), and `importOrg` performs a
  destructive same-org restore in a single transaction — wipe children→parents,
  reinsert parents→children, UUIDs preserved. Cross-org UUID remapping is out of
  scope.

### Patch Changes

- Updated dependencies [f2f3743]
  - @govcore/schema@0.1.0
