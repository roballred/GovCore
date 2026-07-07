# @govcore/tenancy

## 0.2.0

### Minor Changes

- d255afc: Operator-plane console mutations (#63). The org/user administration flows behind an instance console were rebuilt by every consumer (GovEA `actions/instance.ts`, GovCRM `lib/platform.ts`), and the user path is exactly where they diverged. Promote the mutations to core, composing the membership invariants from #65 so the guard and write-sync are identical everywhere.

  `@govcore/tenancy` gains `createOrganization` (auto-slug via the new exported `slugify`; a duplicate slug returns a typed `slug-taken`), `renameOrganization` (name-only; audited before/after), and `updateUserAdministration` — the guard-heavy one: it enforces the last-active-admin invariant via `assertNotLastActiveAdmin` (inside the transaction) and an own-instance-admin lockout, updates the `users` row, and keeps the membership in lockstep via `upsertMembership`. All audited as `platform.org.*` / `platform.user.update` and generic over the app's admin role name; tenancy now depends on `@govcore/audit`.

  `@govcore/auth` gains `provisionUser` — create a user with an initial password + primary membership. It lives here (not tenancy) because it hashes: validates against the policy, hashes, inserts, writes the membership through tenancy's `upsertMembership`, and audits `platform.user.create` without ever putting the password in the payload; a duplicate email returns a typed `email-taken`.

  `@govcore/schema` gains `isUniqueViolation(err)` — a pure, edge-safe SQLSTATE-23505 predicate so operator flows turn a duplicate slug/email into a typed result instead of a 500.

  All framework-agnostic (no FormData/redirect/revalidate — the consumer keeps the thin `'use server'` wrapper and the `instance_admin` gate) and returning typed results rather than throwing.

- a379a16: Membership guards + write-sync as core invariants (#65). The last-active-admin guard, previously re-derived (and diverged) in every consumer, now lives here: `leavesActiveAdminSet` and `wouldOrphanOrg` are pure predicates over a `MembershipChange`, and `assertNotLastActiveAdmin(db, { organizationId, adminRole, change })` composes them over the authoritative membership count, throwing a typed `LastActiveAdminError` (carrying `organizationId`) — so guarding an org against losing its last admin no longer depends on which column a consumer happened to count. `upsertMembership(db, …)` and `setMembershipActiveFlag(db, …)` own the transactional write-sync half: pass your `tx` so the membership row (the source of truth at session resolution) is written in the same transaction as any denormalized `users` columns. All generic over the app's role vocabulary — callers pass their admin role name. Existing exports (`resolveActiveMembership`, `activeMembershipCountByRole`, `findMembership`) are unchanged; internals were split into `memberships`/`guards`/`sync` modules behind the same barrel.

### Patch Changes

- Updated dependencies [d255afc]
  - @govcore/schema@0.2.0
  - @govcore/audit@0.1.1

## 0.1.0

### Minor Changes

- Phase 2 — audit and tenancy.

  `@govcore/audit`: the typed `writeAuditLog` writer (participates in the caller's
  transaction; not fail-silent) plus `listAuditForOrg`. The append-only guarantee
  itself is the Postgres trigger shipped by `@govcore/schema`.

  `@govcore/tenancy`: `resolveActiveMembership` — the single server-side answer to
  "which org am I acting in" (last-selected → primary → oldest active membership),
  plus `activeMembershipCountByRole`. Roles are app-defined `text`.

### Patch Changes

- Updated dependencies [f2f3743]
  - @govcore/schema@0.1.0
