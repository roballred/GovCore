# Base view contract (`@govcore/content/screens`)

**Why this doc exists.** We kept shipping list/detail/edit views that *rendered* but were missing reusable affordances every hand-written app view has (per-row View/Edit, a New button, empty states, delete, gating). Root cause: the content screens were validated against the **data layer** (the Capability spike proved the *generated table* equals the hand-written one) and nobody diffed the **interaction layer** against a real app view. There was no written spec, so each build re-derived a minimal subset and the gaps were invisible.

This doc is that spec. It is derived from GovEA's richest hand-written views (the reference: `apps/govea/src/app/(admin)/capabilities/capability-table.tsx` et al.). **It is the acceptance criteria** for the `@govcore/content/screens` components *and* for any consumer view. A screen or a consumer page is "done" only when it satisfies — or consciously waives, in writing — every row below.

## Reference = the acceptance test

When changing a screen, open the GovEA reference component beside it and walk this checklist. "It renders" is not the bar; "it has every affordance the reference has" is. Waivers are allowed but must be explicit (a comment or an issue), never silent.

## List view — required affordances

| # | Affordance | Reference behavior (GovEA) | In `ContentListScreen` |
|---|---|---|---|
| L1 | **Header + New button** | Title/description left; `+ New {Type}` button right (create), role-gated | `newHref` + `canEdit`-style gate |
| L2 | **Per-row actions** | Right-aligned **View** (→ detail) and **Edit** (→ edit) per row | actions column, `basePath` → `/{id}` and `/{id}/edit` |
| L3 | **Delete + confirm** | Row/danger-zone Delete, admin-gated, with a confirmation | edit-page danger zone (dedicated-routes mode) — see D-view |
| L4 | **Empty-state CTA** | Friendly empty state with an Add action when the type has zero rows | empty-state block + New button |
| L5 | **Search** | Text search over the primary field | `searchable` + `query.q` |
| L6 | **Filters** | Dropdown filters (status/type/…) | `filters` + `query[field]` |
| L7 | **Role / ownership gating** | `canEdit` (admin/contributor), `canDelete` (admin); federated/other-org rows are **View-only** | `canEdit` + per-row `rowEditable(row)` |
| L8 | **Pagination** | Large sets paginate | `pagination` (from `listPage` + `parsePageParams`) |
| L9 | **Status badge** | Lifecycle status per row | `status` column (built in) |

**Interaction model: dedicated routes** (not modal dialogs). New → `${basePath}/new`; Edit → `${basePath}/${id}/edit`; View → `${basePath}/${id}`. RSC-pure: search/filter is a GET `<form>` writing the query to the URL (shareable, no client JS). Screens filter the passed `rows` by `query`; wire filtering into the `list()` query for very large sets.

## Detail view — required affordances

| # | Affordance | In `ContentDetailScreen` |
|---|---|---|
| D1 | Primary value as heading + status badge | built in |
| D2 | All fields/computed values as a definition list | built in |
| D3 | Header **actions** slot (Edit link, Publish, etc.), role-gated | `actions` prop |
| D4 | **Delete danger zone** (confirm), admin-gated | consumer places on the edit route; confirm via a submit-confirm button |

## Edit / create view — required affordances

| # | Affordance | In `ContentForm` |
|---|---|---|
| E1 | Input per editable field, prefilled when editing | built in |
| E2 | `reference`/enumerated fields as selects | `references` / `choices` |
| E3 | Required-field marking + posts to a server action | built in |
| E4 | Cancel/back affordance | consumer adds (link back to list/detail) |
| E5 | Delete (edit route only), admin-gated + confirm | consumer danger zone |

## When you add a new reusable view

1. Find the richest GovEA hand-written equivalent. It is the spec.
2. Enumerate its affordances into this table (extend the table if it has more).
3. Build the screen to the table. Every unmet row is either implemented or an explicit written waiver.
4. Verify by **diffing affordances against the reference**, not by "it renders."
