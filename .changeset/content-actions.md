---
"@govcore/content": minor
---

Content engine — generated CRUD as tenantActions.
`generateContentActions(tenantAction, def, table, { permissions? })` returns
`{ create, update, get, list, remove, publish, archive }`, each wrapped in the
app's `tenantAction` — so org scoping (from the trusted context, never input),
the `app.current_org` RLS GUC, and in-transaction audit come for free. `create`
applies materialized computed values; `update` recomputes them; `publish`/
`archive` delegate to the `transition` lifecycle engine so hooks fire. Adds
`@govcore/server` as a dependency.
