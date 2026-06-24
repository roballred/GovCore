# @govcore/content

## 0.1.0

### Minor Changes

- 215c622: Content engine — generated CRUD as tenantActions.
  `generateContentActions(tenantAction, def, table, { permissions? })` returns
  `{ create, update, get, list, remove, publish, archive }`, each wrapped in the
  app's `tenantAction` — so org scoping (from the trusted context, never input),
  the `app.current_org` RLS GUC, and in-transaction audit come for free. `create`
  applies materialized computed values; `update` recomputes them; `publish`/
  `archive` delegate to the `transition` lifecycle engine so hooks fire. Adds
  `@govcore/server` as a dependency.
- 59fe944: Content engine, Rule 2 (computed fields). Derived fields are declared with a pure
  `compute(row)` function the engine calls:

  - **computed-on-read** — `computeFields(def, row)` / `withComputed(def, row)`
    augment a stored row with its derived values.
  - **materialized** — the compiler emits a real nullable column per materialized
    computed field, `buildContentTable` carries it, `materializedValues(def, row)`
    selects what to persist, and `recompute(db, table, def, id)` reads → computes →
    writes it back (the engine's recompute plumbing).

  `defineContentType` validates computed-field names against the column namespace.

- b4594b9: Start the content engine (Appendix B), slice 1 — Rule 1: compile a content-type
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

- 25eb0ee: Content engine, Rule 3 (per-type hooks). The escape hatch to real code: a content
  type can declare `hooks` — `beforePublish`, `afterPublish`, `afterChange` —
  each `(ctx) => void | Promise<void>` receiving the real tenant `db` and the
  loaded row. `transition(db, table, def, { id, to })` is the lifecycle engine: it
  enforces the workflow (`assertTransition`), runs `beforePublish` (which may throw
  to block — a publish-readiness gate), writes the new status, then runs
  `afterPublish`/`afterChange`. `publish` / `archive` convenience wrappers included.
- 5e737e8: Recipes — installable per-organization bundles (the fourth engine seed, Appendix B). `applyRecipe(db, recipe, runtime)` installs a JSON-describable bundle of taxonomy classifications + seed content into one organization, idempotently and with no migration — the direct continuation of ADR-0002 (a framework like TOGAF becomes data you install). Taxonomy nodes dedupe on `(org, tree, slug)` and wire `parent_id` from the nested structure; seed rows inject `organization_id` + materialized computed columns, skip on a `dedupeBy` match, and resolve `{ $node: { tree, slug } }` references to file under installed nodes. Runs in the caller's tenant transaction, so RLS scopes every write. Also exports the pure `flattenTaxonomy` / `resolveRowRefs` / `isNodeRef` helpers.
- 0c23821: Content engine, Rule 2 (relationships). Typed relationships compile to real
  schema, not joins-by-convention:

  - `reference` (to-one) → a real `<name>_id` FK column on the table (`ON DELETE
RESTRICT` when required, `SET NULL` when optional) with an index.
  - `link` (to-many) → a generated junction table `<type>__<field>` — org-scoped,
    RLS-bound, `PRIMARY KEY (source_id, target_id)` — with `buildLinkTable` and the
    `addLink` / `removeLink` / `listLinkedIds` query helpers.

  `defineContentType` now requires a snake_case `to` on `reference`/`link` fields.
  `taxonomy` and computed fields remain later slices.

- 7aea19e: Generated React screens for a content type, on the `@govcore/content/screens` subpath.

  The same `ContentTypeDefinition` that compiles to a table and CRUD tenantActions now derives its UI: `contentColumns`/`contentFormFields` pure derivation helpers plus presentational, RSC-friendly `ContentListScreen`, `ContentDetailScreen`, and `ContentForm` (a plain `<form action={serverAction}>`, no client hooks) built on `@govcore/nextkit` + the base theme. Exposed on a separate subpath so the server entry stays React-free. React is an optional peer dependency.

- 3ee5222: Taxonomy binding — the third engine seed (Appendix B). A content type's `taxonomy` field is now first-class: it compiles to a `<name>_node_id` FK into one engine-owned, org-scoped, RLS-bound `content.taxonomy_nodes` table (shipped by `taxonomySchemaDdl`), and `buildTree` turns a flat node list into a sorted hierarchy for filter/picker UIs. Adds `buildTaxonomyTable`, `TaxonomyNode`/`TaxonomyTreeNode`, and `taxonomyNodeColumn`; wires taxonomy through validation (requires `tree`) and the generated screens. Also tightens `defineContentType` to reject two fields whose derived columns collide (e.g. a reference `organization` → reserved `organization_id`).
