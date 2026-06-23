// @govcore/content — the content engine (Appendix B).
//
// Slice 1 (Rule 1): describe a content type as data with `defineContentType`,
// compile it into a real, RLS-bound table + migration with `compileContentType`,
// and get the matching runtime Drizzle table with `buildContentTable`. The
// draft→published→archived lifecycle is shared by every type.
//
// Not yet here: relationships + computed fields (Rule 2), per-type hooks (Rule 3),
// generated actions/UI, taxonomy, and recipes — later slices.

export * from './types'
export * from './workflow'
export * from './compile'
export * from './table'
