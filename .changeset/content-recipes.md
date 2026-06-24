---
"@govcore/content": minor
---

Recipes — installable per-organization bundles (the fourth engine seed, Appendix B). `applyRecipe(db, recipe, runtime)` installs a JSON-describable bundle of taxonomy classifications + seed content into one organization, idempotently and with no migration — the direct continuation of ADR-0002 (a framework like TOGAF becomes data you install). Taxonomy nodes dedupe on `(org, tree, slug)` and wire `parent_id` from the nested structure; seed rows inject `organization_id` + materialized computed columns, skip on a `dedupeBy` match, and resolve `{ $node: { tree, slug } }` references to file under installed nodes. Runs in the caller's tenant transaction, so RLS scopes every write. Also exports the pure `flattenTaxonomy` / `resolveRowRefs` / `isNodeRef` helpers.
