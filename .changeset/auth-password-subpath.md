---
"@govcore/auth": patch
---

Add an edge-/Node-safe `./password` subpath export (bcrypt hash/verify +
`validatePassword`) so callers can hash passwords without importing the full
NextAuth-backed entrypoint (e.g. seed scripts).
