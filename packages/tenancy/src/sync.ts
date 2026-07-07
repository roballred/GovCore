// @govcore/tenancy — membership write-sync.
//
// Since active-org resolution reads `user_organization_memberships`, the
// membership row is the source of truth at session time. Any flow that grants
// or changes org access must therefore write that row — otherwise the change
// silently does not take effect: the stale membership wins when the next
// session resolves. Consumers that also keep a denormalized `users.role`/
// `users.is_active` must update both in the *same* transaction; these helpers
// own the membership half so both consumers stop hand-rolling the upsert.
//
// The first parameter is a GovcoreDb, which a transaction handle satisfies —
// pass your `tx` so the membership write joins the caller's transaction.

import { userOrganizationMemberships, type GovcoreDb } from '@govcore/schema'
import { and, eq } from 'drizzle-orm'

/**
 * Insert-or-update the (user, org) membership. Updating in place also heals a
 * legacy account that predates the memberships backfill: its first role change
 * mints the canonical row. Roles are app-defined text — pass your own.
 *
 * Idempotent on the unique (user, org) index, so a double-submit or retry
 * converges rather than erroring on a duplicate insert.
 */
export async function upsertMembership(
  db: GovcoreDb,
  opts: {
    userId: string
    organizationId: string
    role: string
    isPrimary?: boolean
    isActive?: boolean
  },
): Promise<void> {
  const { userId, organizationId, role, isPrimary = false, isActive = true } = opts

  const updated = await db
    .update(userOrganizationMemberships)
    .set({ role, isActive, updatedAt: new Date() })
    .where(
      and(
        eq(userOrganizationMemberships.userId, userId),
        eq(userOrganizationMemberships.organizationId, organizationId),
      ),
    )
    .returning({ id: userOrganizationMemberships.id })

  if (updated.length === 0) {
    await db.insert(userOrganizationMemberships).values({
      userId,
      organizationId,
      role,
      isPrimary,
      isActive,
    })
  }
}

/**
 * Set only the `is_active` flag for an existing (user, org) membership. A no-op
 * when no row exists — account-level `users.is_active` already gates a legacy
 * account, and deactivating must never mint a new membership row.
 */
export async function setMembershipActiveFlag(
  db: GovcoreDb,
  userId: string,
  organizationId: string,
  isActive: boolean,
): Promise<void> {
  await db
    .update(userOrganizationMemberships)
    .set({ isActive, updatedAt: new Date() })
    .where(
      and(
        eq(userOrganizationMemberships.userId, userId),
        eq(userOrganizationMemberships.organizationId, organizationId),
      ),
    )
}
