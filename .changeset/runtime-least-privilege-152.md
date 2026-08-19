---
"@govcore/setup": minor
"@govcore/schema": patch
---

Least-privilege runtime GRANTs (#152): `provisionRuntimeRole` no longer grants blanket `SELECT, INSERT, UPDATE, DELETE ON ALL TABLES` in `govcore`. The runtime role gets SELECT on `organizations`, full DML on RLS-bound tenant/federation tables, SELECT/INSERT on `audit_log`, and **no** access to Auth.js adapter tables, support/operator tables, or the migrate journal (those stay on `authDb` / `operatorDb` / owner). Re-running REVOKEs prior blanket grants. Content schema still gets full DML + default privileges. Migration `0005` documents the matrix; architecture + consumer-guide updated. Smoke asserts the denials under the non-owner role.
