// @govcore/federation — cross-organization connections + federated visibility.
//
// connections: the bilateral org-to-org connection lifecycle (request / accept /
// reject), audited; an active connection is what federated reads key off.
// visibility: the org | connections | instance scoping helpers for list queries
// and single-row read checks over app-owned content.
//
// Cross-org *content links* (app-defined `link_type` semantics) are a separate
// surface and not part of this package yet.

export * from './connections'
export * from './visibility'
