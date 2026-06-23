---
"@govcore/content": minor
---

Start the content engine (Appendix B), slice 1 — Rule 1: compile a content-type
definition into a real, RLS-bound table, never an EAV blob.

- `defineContentType({ name, label, fields })` with scalar field types (text,
  textarea, number, boolean, date) and validation (snake_case identifiers, no
  duplicate or engine-reserved field names). `reference`/`taxonomy` are in the
  vocabulary but deferred to Rule 2.
- `compileContentType(def, { schema? })` → idempotent migration DDL: the table
  with `id`, `organization_id` (FK → govcore.organizations), typed columns, a
  `status` lifecycle column, timestamps, an org index, and ENABLE/FORCE RLS with
  the `app.current_org` GUC policy — matching the platform tables.
- `buildContentTable(def, { schema? })` → the matching runtime Drizzle table.
- workflow lifecycle (`canTransition`, `allowedTransitions`) promoted from the
  `@govea/core` stub.

Relationships + computed fields (Rule 2), hooks (Rule 3), generated actions/UI,
taxonomy, and recipes are later slices.
