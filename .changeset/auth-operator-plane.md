---
'@govcore/auth': minor
'@govcore/server': minor
---

The operator/identity plane: fix the two-role login wall and name the operator seam (#57).

`createAuth` gains an `authDb` option. Under the two-role split the runtime `db` connects as a non-owner, so `govcore.users`/memberships are FORCE-RLS-filtered by the `app.current_org` GUC — which cannot exist before a session does, so a credentials login finds zero rows and fails with `CredentialsSignin`. `authDb` is the identity-plane pool (a superuser or `BYPASSRLS` role — FORCE binds even the owner) that createAuth uses for the adapter, credentials lookup, SSO-provisioning check, membership resolution, and login/logout audit. Defaults to `db`, so single-role/dev setups are unchanged; two-role consumers stop reinventing an `authDb`/`platformDb` convention to get past login.

`@govcore/server` gains `createOperatorActions` — the operator-plane counterpart to `createTenantActions`. Where `tenantAction` runs on the runtime pool, sets the org GUC, and gates by an RBAC permission, `operatorAction` runs on the privileged pool, sets **no** org GUC (cross-org by design), and gates by `instanceRole` (default `instance_admin`, exported as `INSTANCE_ADMIN_ROLE`). It hands the handler the privileged db plus an audit writer pre-bound to the operator — so a consumer's ad-hoc `platformDb.select(...)` becomes a named, instance-admin-gated seam the gate can't be forgotten on. Composes the #63 console mutations (`createOrganization`, `updateUserAdministration`, …), which manage their own transactions.
