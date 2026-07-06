// @govcore/tenancy — the membership model: active-org resolution, org guards,
// and the write-sync that keeps membership rows authoritative.
//
//   memberships — resolveActiveMembership (the crown jewel), counts, lookup
//   guards      — the last-active-admin invariant (pure predicate + async assert)
//   sync        — transactional membership upsert / deactivate
//
// Roles are app-defined `text` (see @govcore/rbac); this package never assumes
// a role vocabulary — callers pass their own admin role name.

export {
  resolveActiveMembership,
  activeMembershipCountByRole,
  findMembership,
  type ActiveContext,
} from './memberships'

export {
  LastActiveAdminError,
  leavesActiveAdminSet,
  wouldOrphanOrg,
  assertNotLastActiveAdmin,
  type MembershipChange,
} from './guards'

export { upsertMembership, setMembershipActiveFlag } from './sync'
