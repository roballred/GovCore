---
'@govcore/nextkit': minor
'@govcore/content': minor
---

Server-driven pagination for list views (#72) — no more silent `limit(50)` ceilings.

`@govcore/nextkit`: `DataTable` gains an optional `pagination` prop that renders a prev/next + "Showing X–Y of Z" footer as plain links (no client JS — works in a Server Component). New pure helpers: `parsePageParams(searchParams)` reads and clamps `page`/`pageSize` from App Router `searchParams` (a hand-edited URL can't produce a negative offset or an unbounded query), and `pageHref(pathname, searchParams, page)` builds a page link that preserves the other query params. Also exports `TablePagination`, `PageParams`, `PaginationProps`, and `DEFAULT_PAGE_SIZE`.

`@govcore/content`: generated actions gain `listPage({ page?, pageSize? }) → { rows, total, page, pageSize }` (LIMIT/OFFSET slice + total count, same clamping), and `ContentListScreen` takes a `pagination` prop it passes through — so `parsePageParams` → `listPage` → screen paginates a content list end to end. `list()` (all rows) is unchanged; this is additive.
