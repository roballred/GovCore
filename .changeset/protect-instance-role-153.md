---
"@govcore/schema": minor
"@govcore/setup": patch
---

Protect `users.instance_role` from runtime escalation (#153): migration `0006` adds a BEFORE INSERT/UPDATE trigger that allows changes only from the privilege plane (superuser, BYPASSRLS/`authDb`, or table owner). `provisionRuntimeRole` also `REVOKE UPDATE (instance_role)` as defense in depth. Smoke asserts runtime denial and privilege-plane allow.
