// @govcore/federation — cross-organization connections + federated visibility.
//
// connections: the bilateral org-to-org connection lifecycle (request / accept /
// reject), audited; an active connection is what federated reads key off.
// visibility: the org | connections | instance scoping helpers for list queries
// and single-row read checks over app-owned content.
//
// links: the cross-org content-link lifecycle (request / approve / reject /
// withdraw / revoke) plus review-flag and connection-cleanup helpers. Entity
// types and link_type are app-defined strings; the app validates entity
// ownership/visibility, this owns the link record.

export * from './connections'
export * from './visibility'
export * from './links'
