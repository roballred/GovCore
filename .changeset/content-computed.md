---
"@govcore/content": minor
---

Content engine, Rule 2 (computed fields). Derived fields are declared with a pure
`compute(row)` function the engine calls:

- **computed-on-read** — `computeFields(def, row)` / `withComputed(def, row)`
  augment a stored row with its derived values.
- **materialized** — the compiler emits a real nullable column per materialized
  computed field, `buildContentTable` carries it, `materializedValues(def, row)`
  selects what to persist, and `recompute(db, table, def, id)` reads → computes →
  writes it back (the engine's recompute plumbing).

`defineContentType` validates computed-field names against the column namespace.
