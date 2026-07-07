// @govcore/tenancy — the last-active-admin guard.
//
// Every consumer rebuilds this and some get it wrong: GovEA counted admin
// *membership rows*; a second consumer (GovCRM) counted the denormalized
// `users.role` column — a different basis that gives different answers once a
// user belongs to more than one org. The invariant is core, so the decision
// lives here, expressed as a pure predicate the async assert composes over the
// authoritative membership count. Roles are app-defined text (see
// @govcore/rbac): the caller passes its own admin role name.

import { activeMembershipCountByRole } from './memberships'
import type { GovcoreDb } from '@govcore/schema'

/**
 * Thrown when a proposed membership change would leave an organization with no
 * active admin. Carries the org id so the caller can route a typed error
 * (a redirect, a form message) without string-matching.
 */
export class LastActiveAdminError extends Error {
  readonly organizationId: string
  constructor(organizationId: string) {
    super(
      `Refusing to remove the last active admin of organization ${organizationId}`,
    )
    this.name = 'LastActiveAdminError'
    this.organizationId = organizationId
  }
}

/**
 * A proposed change to a single (user, org) membership: the current role/active
 * state and what they would become. Deactivation is `nextIsActive: false`;
 * demotion is a `nextRole` other than the admin role.
 */
export interface MembershipChange {
  currentRole: string
  currentIsActive: boolean
  nextRole: string
  nextIsActive: boolean
}

/**
 * Pure: does applying `change` remove this membership from the org's set of
 * active admins? True only on the transition admin→not-admin — where
 * not-admin means either a non-admin role or deactivation. Promotions,
 * no-op saves, and changes among non-admins never orphan an org, so they
 * short-circuit the count query.
 */
export function leavesActiveAdminSet(change: MembershipChange, adminRole: string): boolean {
  const wasAdmin = change.currentIsActive && change.currentRole === adminRole
  const willBeAdmin = change.nextIsActive && change.nextRole === adminRole
  return wasAdmin && !willBeAdmin
}

/**
 * Pure: would this change orphan the org — i.e. leave it with zero active
 * admins? `activeAdminCount` is the current count of active admin memberships
 * **including** the target user, as returned by activeMembershipCountByRole.
 * If the change removes this user from the admin set and they were the only
 * one (`count <= 1`), the org is orphaned.
 *
 * Separated from the DB read so the whole decision is unit-testable without a
 * database — the part every consumer has re-derived by hand.
 */
export function wouldOrphanOrg(opts: {
  activeAdminCount: number
  change: MembershipChange
  adminRole: string
}): boolean {
  if (!leavesActiveAdminSet(opts.change, opts.adminRole)) return false
  return opts.activeAdminCount <= 1
}

/**
 * Throw {@link LastActiveAdminError} if `change` would leave `organizationId`
 * with no active admin. A no-op for changes that cannot orphan the org (and
 * for those it skips the count query entirely).
 *
 * Call inside the same transaction as the write it guards, so the count and
 * the mutation see a consistent snapshot.
 */
export async function assertNotLastActiveAdmin(
  db: GovcoreDb,
  opts: {
    organizationId: string
    adminRole: string
    change: MembershipChange
  },
): Promise<void> {
  if (!leavesActiveAdminSet(opts.change, opts.adminRole)) return
  const activeAdminCount = await activeMembershipCountByRole(
    db,
    opts.organizationId,
    opts.adminRole,
  )
  if (wouldOrphanOrg({ activeAdminCount, change: opts.change, adminRole: opts.adminRole })) {
    throw new LastActiveAdminError(opts.organizationId)
  }
}
