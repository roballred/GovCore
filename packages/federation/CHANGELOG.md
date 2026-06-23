# @govcore/federation

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
