# @govcore/federation

## 0.2.4

### Patch Changes

- Updated dependencies [f993e42]
  - @govcore/schema@0.4.0
  - @govcore/audit@0.1.4

## 0.2.3

### Patch Changes

- Updated dependencies [c9ae7c1]
  - @govcore/schema@0.3.0
  - @govcore/audit@0.1.3

## 0.2.2

### Patch Changes

- fbd5dc1: Ship compiled builds — retire source-first packaging (#71, closes #56).

  Every package published `main: ./src/index.ts`, which pushed core's build internals onto consumers: internal type deps leaked (a consumer needed `@types/bcryptjs` just to typecheck `@govcore/auth`, #56), every Next.js app had to list all 14 packages in `transpilePackages`, and non-Next/Node consumers couldn't consume the TS source at all.

  Each package now builds with **tsup** to ESM + `.d.ts` + sourcemaps in `dist/`, with `exports`/`main`/`types` pointing at the compiled output and `files` limited to what ships (`dist`, plus `migrations/` for schema and `base.css` for theme). Intra-package modules are bundled; `dependencies`/`peerDependencies` (the other `@govcore/*` packages, drizzle, react, …) stay external. Multi-entry packages keep their subpaths compiled — `@govcore/auth/password`, `@govcore/content/screens`, `@govcore/schema/migrate`; the `govcore-migrate` bin still resolves `../migrations` from `dist/`.

  Non-breaking: a consumer that keeps `transpilePackages` for these keeps working (transpiling already-compiled ESM is a no-op) — but no longer needs it, or any of core's internal `@types`. Proven by the canary (`examples/minimal-app`) now building with an empty `next.config`, and by a CI build step so both the canary and the smoke resolve the compiled `dist/` rather than source.

- Updated dependencies [fbd5dc1]
  - @govcore/schema@0.2.1
  - @govcore/audit@0.1.2

## 0.2.1

### Patch Changes

- Updated dependencies [d255afc]
  - @govcore/schema@0.2.0
  - @govcore/audit@0.1.1

## 0.2.0

### Minor Changes

- 1d1794f: Add the cross-org content-link lifecycle to `@govcore/federation`. Entity types
  and `linkType` are app-defined strings; the app validates entity
  ownership/visibility, this owns the link record:

  - reads — `getCrossOrgLinks`, `getLinksForEntity`, `findCrossOrgLink`;
  - lifecycle (audited) — `requestCrossOrgLink` (blocks an existing pending/active
    pair, reactivates a rejected one), `approveCrossOrgLink` / `rejectCrossOrgLink`
    (target org only), `withdrawCrossOrgLink` (source org), `revokeCrossOrgLink`
    (target org, active only);
  - review flags + connection cleanup — `flagLinksForVisibilityDrop`,
    `clearLinksFlag`, `removeLinksForConnection`;
  - pure helper `resolveLinkRequest`.

## 0.1.0

### Minor Changes

- Phase 4 — `@govcore/federation`: cross-organization connections and federated
  visibility.

  connections: the bilateral request / accept / reject lifecycle (audited; only
  the target org may accept or reject), with `getConnections` /
  `findConnectionBetween`. visibility: `FederationVisibility` / `ListScope`,
  `parseListScope`, the generic `listScopeFilter`, `assertOwnership`,
  `getConnectedOrgIds`, and `canReadFederatedEntity`. Cross-org content links are
  not part of this release.

### Patch Changes

- Updated dependencies
- Updated dependencies [f2f3743]
  - @govcore/audit@0.1.0
  - @govcore/schema@0.1.0
