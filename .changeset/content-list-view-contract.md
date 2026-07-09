---
'@govcore/content': minor
---

`ContentListScreen` now implements the full base list-view contract (parity with hand-written app tables), so consumers stop re-deriving — and missing — these affordances:

- **New button** (`newHref`) in the header and empty state
- **Per-row actions** column: **View** (`${basePath}/${id}`) and **Edit** (`${basePath}/${id}/edit`) — dedicated routes, not dialogs
- **Empty-state CTA** when the type has no rows
- **Search** (`searchable`) over the primary field and **dropdown filters** (`filters`), driven by the route's `query` (searchParams) — RSC-pure GET form, shareable URLs
- **Role/ownership gating** via `canEdit` + a per-row `rowEditable(row)` (own-org vs federated → View-only)

New `ContentListFilter` type. Existing props unchanged; all additions are optional, so current callers keep working (they simply gain nothing until they opt in).

Also adds `docs/design/base-view-contract.md` — the written list/detail/edit contract derived from GovEA's reference components, to be used as the acceptance criteria for screens and consumers.
