# @govcore/content

## 0.5.3

### Patch Changes

- Updated dependencies [51a048b]
  - @govcore/nextkit@0.8.0

## 0.5.2

### Patch Changes

- Updated dependencies [7340293]
  - @govcore/nextkit@0.7.0

## 0.5.1

### Patch Changes

- @govcore/server@0.3.2
- @govcore/nextkit@0.6.1

## 0.5.0

### Minor Changes

- acd140f: `ContentListScreen` — extend the base list-view contract toward GovEA parity (part of #97):

  - **Delete + confirm**: a per-row Delete action gated by `canDelete` + a `deleteAction` (+ optional `rowDeletable`), which posts the row id to your generated `remove` and confirms first via `@govcore/nextkit/client`'s `ConfirmButton`.
  - **Column curation**: a `columns?: string[]` prop selects which field/computed columns render (ordered; `status` always kept), so wide content types no longer push the Actions column off-screen.

### Patch Changes

- Updated dependencies [acd140f]
  - @govcore/nextkit@0.6.0

## 0.4.1

### Patch Changes

- Updated dependencies [f993e42]
  - @govcore/schema@0.4.0
  - @govcore/server@0.3.1
  - @govcore/nextkit@0.5.1

## 0.4.0

### Minor Changes

- 1ca5802: `ContentListScreen` now implements the full base list-view contract (parity with hand-written app tables), so consumers stop re-deriving — and missing — these affordances:

  - **New button** (`newHref`) in the header and empty state
  - **Per-row actions** column: **View** (`${basePath}/${id}`) and **Edit** (`${basePath}/${id}/edit`) — dedicated routes, not dialogs
  - **Empty-state CTA** when the type has no rows
  - **Search** (`searchable`) over the primary field and **dropdown filters** (`filters`), driven by the route's `query` (searchParams) — RSC-pure GET form, shareable URLs
  - **Role/ownership gating** via `canEdit` + a per-row `rowEditable(row)` (own-org vs federated → View-only)

  New `ContentListFilter` type. Existing props unchanged; all additions are optional, so current callers keep working (they simply gain nothing until they opt in).

  Also adds `docs/design/base-view-contract.md` — the written list/detail/edit contract derived from GovEA's reference components, to be used as the acceptance criteria for screens and consumers.

## 0.3.1

### Patch Changes

- Updated dependencies [62a4bc4]
- Updated dependencies [34d3827]
  - @govcore/nextkit@0.5.0

## 0.3.0

### Minor Changes

- 9f85ca0: Server-driven pagination for list views (#72) — no more silent `limit(50)` ceilings.

  `@govcore/nextkit`: `DataTable` gains an optional `pagination` prop that renders a prev/next + "Showing X–Y of Z" footer as plain links (no client JS — works in a Server Component). New pure helpers: `parsePageParams(searchParams)` reads and clamps `page`/`pageSize` from App Router `searchParams` (a hand-edited URL can't produce a negative offset or an unbounded query), and `pageHref(pathname, searchParams, page)` builds a page link that preserves the other query params. Also exports `TablePagination`, `PageParams`, `PaginationProps`, and `DEFAULT_PAGE_SIZE`.

  `@govcore/content`: generated actions gain `listPage({ page?, pageSize? }) → { rows, total, page, pageSize }` (LIMIT/OFFSET slice + total count, same clamping), and `ContentListScreen` takes a `pagination` prop it passes through — so `parsePageParams` → `listPage` → screen paginates a content list end to end. `list()` (all rows) is unchanged; this is additive.

### Patch Changes

- Updated dependencies [9f85ca0]
- Updated dependencies [c9ae7c1]
  - @govcore/nextkit@0.4.0
  - @govcore/schema@0.3.0
  - @govcore/server@0.3.0

## 0.2.3

### Patch Changes

- fbd5dc1: Ship compiled builds — retire source-first packaging (#71, closes #56).

  Every package published `main: ./src/index.ts`, which pushed core's build internals onto consumers: internal type deps leaked (a consumer needed `@types/bcryptjs` just to typecheck `@govcore/auth`, #56), every Next.js app had to list all 14 packages in `transpilePackages`, and non-Next/Node consumers couldn't consume the TS source at all.

  Each package now builds with **tsup** to ESM + `.d.ts` + sourcemaps in `dist/`, with `exports`/`main`/`types` pointing at the compiled output and `files` limited to what ships (`dist`, plus `migrations/` for schema and `base.css` for theme). Intra-package modules are bundled; `dependencies`/`peerDependencies` (the other `@govcore/*` packages, drizzle, react, …) stay external. Multi-entry packages keep their subpaths compiled — `@govcore/auth/password`, `@govcore/content/screens`, `@govcore/schema/migrate`; the `govcore-migrate` bin still resolves `../migrations` from `dist/`.

  Non-breaking: a consumer that keeps `transpilePackages` for these keeps working (transpiling already-compiled ESM is a no-op) — but no longer needs it, or any of core's internal `@types`. Proven by the canary (`examples/minimal-app`) now building with an empty `next.config`, and by a CI build step so both the canary and the smoke resolve the compiled `dist/` rather than source.

- Updated dependencies [fbd5dc1]
  - @govcore/schema@0.2.1
  - @govcore/server@0.2.1
  - @govcore/nextkit@0.3.1

## 0.2.2

### Patch Changes

- Updated dependencies [f45843c]
  - @govcore/server@0.2.0

## 0.2.1

### Patch Changes

- Updated dependencies [d255afc]
- Updated dependencies [2b7d55e]
  - @govcore/schema@0.2.0
  - @govcore/nextkit@0.3.0
  - @govcore/server@0.1.2

## 0.2.0

### Minor Changes

- 483bd01: Base list/edit/detail patterns for references (#61): `ReferenceDisplay`/`ReferenceDisplayMap` let screens render labels (optionally linked via `hrefBase`) instead of raw uuids in `ContentListScreen`/`ContentDetailScreen`/`contentColumns`; `ContentForm` renders a `<select>` for reference fields when `options` are provided (uuid input remains the fallback), prefilled on edit; `ContentDetailScreen` gains an `actions` header slot (Edit link, publish button); `ContentForm` also takes `choices` (enumerated scalar fields render selects); and `parseContentForm(def, formData)` is the canonical FormData→row coercion (empty optional → null, checkbox → boolean) so consumers stop hand-rolling it.

## 0.1.2

### Patch Changes

- Updated dependencies [d24e883]
  - @govcore/nextkit@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [f3bce48]
  - @govcore/server@0.1.1

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
