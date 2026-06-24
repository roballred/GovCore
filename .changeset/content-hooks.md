---
"@govcore/content": minor
---

Content engine, Rule 3 (per-type hooks). The escape hatch to real code: a content
type can declare `hooks` — `beforePublish`, `afterPublish`, `afterChange` —
each `(ctx) => void | Promise<void>` receiving the real tenant `db` and the
loaded row. `transition(db, table, def, { id, to })` is the lifecycle engine: it
enforces the workflow (`assertTransition`), runs `beforePublish` (which may throw
to block — a publish-readiness gate), writes the new status, then runs
`afterPublish`/`afterChange`. `publish` / `archive` convenience wrappers included.
