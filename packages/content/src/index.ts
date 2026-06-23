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
// Not yet here: computed fields (Rule 2), per-type hooks (Rule 3), generated
// actions/UI, taxonomy, and recipes — later slices.

export * from './types'
export * from './workflow'
export * from './compile'
export * from './table'
export * from './relationships'
