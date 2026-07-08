---
'@govcore/schema': minor
'@govcore/tenancy': minor
'@govcore/server': minor
'@govcore/auth': minor
---

Organization lifecycle: suspend / reinstate / archive, enforced (#69).

Lifecycle was unmodeled — the only escape hatch was `organizations.metadata`, which nothing enforced. It's now first-class and gated at the platform layer.

- **`@govcore/schema`** — `organizations` gains `status` (`active | suspended | archived`, default `active`) plus `status_reason` / `status_changed_at` / `status_changed_by` (migration `0003`). Exports `ORGANIZATION_STATUSES`, the `OrganizationStatus` type, and the pure `isOrganizationActive(status)`. `metadata` is documented as the app's extension bag only — lifecycle no longer lives there.
- **`@govcore/tenancy`** — `suspendOrganization` (reason required), `reinstateOrganization` (back to `active`, clears the reason), and `archiveOrganization` (soft-delete; data retained — a hard delete is a `@govcore/backup` export-then-purge concern). Each stamps who/when and audits `platform.org.suspend` / `reinstate` / `archive`.
- **`@govcore/server`** — `createTenantActions` now gates on org status: a suspended/archived org runs **no** tenant transaction regardless of the actor's permissions. New optional `onOrgInactive(status)` hook (default throws `Organization is <status>`) so the app can route to a dedicated page. `organizations` isn't RLS-bound, so the check reads on the runtime pool.
- **`@govcore/auth`** — `createAuth` denies a session whose resolved active org is suspended/archived: blocked at login and dropped within the 5-minute re-validation window.

Additive — with the default `active` status, existing consumers see no behavior change. Not yet modeled: multi-org "skip the suspended org, resolve the next active membership" (today a session bound to a suspended org is denied rather than re-homed).
