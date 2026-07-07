# @govcore/backup

## 0.2.1

### Patch Changes

- Updated dependencies [d255afc]
  - @govcore/schema@0.2.0

## 0.2.0

### Minor Changes

- 01ded6f: Add cross-org clone to `@govcore/backup`. `importOrg` preserves UUIDs (same-org
  restore); `cloneOrgInto(db, registry, bundle, { targetOrgId, forceFields?, newId? })`
  copies a bundle into a _different_ org with regenerated primary keys, remapping
  declared references to the cloned rows so foreign keys stay valid — additive, so
  the clone coexists with the source. The registry gains optional `pkField` and
  `references` for this; `importOrg` is unchanged. Pure helpers `buildIdMaps` and
  `remapRowIds` are exported.

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
