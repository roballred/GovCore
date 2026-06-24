// @govcore/content — the content engine (Appendix B).
//
// Rule 1: describe a content type as data with `defineContentType`, compile it
// into a real, RLS-bound table + migration with `compileContentType`, and get the
// matching runtime Drizzle table with `buildContentTable`. The
// draft→published→archived lifecycle is shared by every type.
//
// Rule 2 (relationships): `reference` (to-one) FK columns and `link` (to-many)
// junction tables, with `buildLinkTable` + add/remove/list link helpers.
//
// Rule 2 (computed): derived fields via a pure `compute(row)` — computed-on-read
// (`withComputed`) or materialized into a real column refreshed by `recompute`.
//
// Rule 3 (hooks): the escape hatch to real code — `beforePublish`/`afterPublish`/
// `afterChange` hooks invoked by the `transition` lifecycle engine.
//
// Taxonomy (./taxonomy): the shared classification — `buildTree` + the
// engine-owned `taxonomy_nodes` table a `taxonomy` field files rows under.
//
// Recipes (./recipes): `applyRecipe` installs a per-org bundle of taxonomy
// classifications + seed content, idempotently and with no migration — a
// framework (TOGAF, ADR-0002) becomes data you install.
//
// Generated CRUD actions live in ./actions. Generated React screens are on the
// separate `@govcore/content/screens` subpath (./screens) so this server entry
// stays React-free.

export * from './types'
export * from './workflow'
export * from './compile'
export * from './table'
export * from './relationships'
export * from './computed'
export * from './hooks'
export * from './actions'
export * from './taxonomy'
export * from './recipes'
