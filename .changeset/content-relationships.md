---
"@govcore/content": minor
---

Content engine, Rule 2 (relationships). Typed relationships compile to real
schema, not joins-by-convention:

- `reference` (to-one) → a real `<name>_id` FK column on the table (`ON DELETE
  RESTRICT` when required, `SET NULL` when optional) with an index.
- `link` (to-many) → a generated junction table `<type>__<field>` — org-scoped,
  RLS-bound, `PRIMARY KEY (source_id, target_id)` — with `buildLinkTable` and the
  `addLink` / `removeLink` / `listLinkedIds` query helpers.

`defineContentType` now requires a snake_case `to` on `reference`/`link` fields.
`taxonomy` and computed fields remain later slices.
