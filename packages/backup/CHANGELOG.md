# @govcore/backup

## 0.2.3

### Patch Changes

- Updated dependencies [c9ae7c1]
  - @govcore/schema@0.3.0

## 0.2.2

### Patch Changes

- fbd5dc1: Ship compiled builds — retire source-first packaging (#71, closes #56).

  Every package published `main: ./src/index.ts`, which pushed core's build internals onto consumers: internal type deps leaked (a consumer needed `@types/bcryptjs` just to typecheck `@govcore/auth`, #56), every Next.js app had to list all 14 packages in `transpilePackages`, and non-Next/Node consumers couldn't consume the TS source at all.

  Each package now builds with **tsup** to ESM + `.d.ts` + sourcemaps in `dist/`, with `exports`/`main`/`types` pointing at the compiled output and `files` limited to what ships (`dist`, plus `migrations/` for schema and `base.css` for theme). Intra-package modules are bundled; `dependencies`/`peerDependencies` (the other `@govcore/*` packages, drizzle, react, …) stay external. Multi-entry packages keep their subpaths compiled — `@govcore/auth/password`, `@govcore/content/screens`, `@govcore/schema/migrate`; the `govcore-migrate` bin still resolves `../migrations` from `dist/`.

  Non-breaking: a consumer that keeps `transpilePackages` for these keeps working (transpiling already-compiled ESM is a no-op) — but no longer needs it, or any of core's internal `@types`. Proven by the canary (`examples/minimal-app`) now building with an empty `next.config`, and by a CI build step so both the canary and the smoke resolve the compiled `dist/` rather than source.

- Updated dependencies [fbd5dc1]
  - @govcore/schema@0.2.1

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
