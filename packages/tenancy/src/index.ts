// @govcore/tenancy — the membership model: active-org resolution, org guards,
// the write-sync that keeps membership rows authoritative, and the operator-plane
// org/user administration mutations built on them.
//
//   memberships    — resolveActiveMembership (the crown jewel), counts, lookup
//   guards         — the last-active-admin invariant (pure predicate + async assert)
//   sync           — transactional membership upsert / deactivate
//   administration — operator org create/rename + user role/active/instance-admin
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

export {
  slugify,
  createOrganization,
  renameOrganization,
  updateUserAdministration,
  updateMembershipAdministration,
  suspendOrganization,
  reinstateOrganization,
  archiveOrganization,
  type CreateOrganizationResult,
  type RenameOrganizationResult,
  type UpdateUserAdministrationResult,
  type UpdateMembershipAdministrationResult,
  type OrganizationLifecycleResult,
} from './administration'
