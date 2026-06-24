# @govcore/federation

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
