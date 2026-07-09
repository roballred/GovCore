---
"@govcore/schema": minor
"@govcore/tenancy": patch
---

users.organization_id: relax to nullable + ON DELETE SET NULL (#104).

`organization_id` was `NOT NULL` + `ON DELETE CASCADE`, but it is a denormalized *home* pointer — `user_organization_memberships` is the authority on org access. That combination carried two defects, both hit by GovEA (consumer zero) and fixed there in ADR-0006:

- **Multi-org identity data-loss.** Deleting a user's home org cascade-deleted their identity even when their memberships in *other* orgs were still valid, and orphaned the `audit_log` rows referencing that user id.
- **No platform-only operators.** An `instanceRole` holder with no tenant org could not exist, since every identity was forced into an org.

`@govcore/schema` — migration `0004_users_org_nullable` drops `NOT NULL` and swaps the FK to `ON DELETE SET NULL`; the `users.organizationId` Drizzle type is now `string | null`. Org-scoped tables keep `NOT NULL organization_id` — the tenancy/RLS contract is unchanged; only the identity home pointer relaxes.

`@govcore/tenancy` — `updateUserAdministration` no-ops the org-scoped bookkeeping (membership lookup/write, last-admin guard) for an org-less user, updating only the identity + instance-admin grant.

On org deletion the home pointer nulls, per-org access drops via the membership table's own cascade, and deactivating a user whose last active membership is gone remains an app-level policy (not a DB cascade).
