---
'@govcore/content': minor
---

`ContentListScreen` — extend the base list-view contract toward GovEA parity (part of #97):

- **Delete + confirm**: a per-row Delete action gated by `canDelete` + a `deleteAction` (+ optional `rowDeletable`), which posts the row id to your generated `remove` and confirms first via `@govcore/nextkit/client`'s `ConfirmButton`.
- **Column curation**: a `columns?: string[]` prop selects which field/computed columns render (ordered; `status` always kept), so wide content types no longer push the Actions column off-screen.
