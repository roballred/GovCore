// @govcore/tenancy — membership reads: active-org resolution + counts.
//
// The crown jewel is resolveActiveMembership — the single server-side answer to
// "which org am I acting in right now," which feeds the session/JWT and every
// org-scoped check. Roles are app-defined `text` (see @govcore/rbac), so this
// package returns the role as a string and never assumes a vocabulary.

import { userOrganizationMemberships, type GovcoreDb } from '@govcore/schema'
import { and, count, eq } from 'drizzle-orm'

export interface ActiveContext {
  organizationId: string
  role: string
}

/**
 * Resolve a user's *active* organization context from their memberships.
 *
 * Selection order:
 *   1. `preferredOrgId` (last-selected) — only if still an active membership;
 *   2. the **primary** active membership;
 *   3. the oldest active membership (deterministic tie-break).
 *
 * Returns `null` when the user has no active membership. Only `is_active`
 * memberships are eligible — a stale last-selected pointing at a revoked
 * membership is correctly ignored.
 */
export async function resolveActiveMembership(
  db: GovcoreDb,
  userId: string,
  preferredOrgId?: string | null,
): Promise<ActiveContext | null> {
  const memberships = await db
    .select({
      organizationId: userOrganizationMemberships.organizationId,
      role: userOrganizationMemberships.role,
      isPrimary: userOrganizationMemberships.isPrimary,
      createdAt: userOrganizationMemberships.createdAt,
    })
    .from(userOrganizationMemberships)
    .where(
      and(
        eq(userOrganizationMemberships.userId, userId),
        eq(userOrganizationMemberships.isActive, true),
      ),
    )

  if (memberships.length === 0) return null

  // 1. Honor last-selected when it is still an active membership.
  if (preferredOrgId) {
    const preferred = memberships.find((m) => m.organizationId === preferredOrgId)
    if (preferred) return { organizationId: preferred.organizationId, role: preferred.role }
  }

  // 2/3. Primary first; then oldest, so selection is deterministic.
  const chosen = [...memberships].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
    return a.createdAt.getTime() - b.createdAt.getTime()
  })[0]

  return { organizationId: chosen.organizationId, role: chosen.role }
}

/**
 * Count active memberships holding `role` in an org. The basis for a last-admin
 * guard — generic over the app's role names (pass your admin role).
 */
export async function activeMembershipCountByRole(
  db: GovcoreDb,
  organizationId: string,
  role: string,
): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(userOrganizationMemberships)
    .where(
      and(
        eq(userOrganizationMemberships.organizationId, organizationId),
        eq(userOrganizationMemberships.role, role),
        eq(userOrganizationMemberships.isActive, true),
      ),
    )
  return row?.c ?? 0
}

/** Look up a single (user, org) membership, or null. */
export async function findMembership(db: GovcoreDb, userId: string, organizationId: string) {
  const [row] = await db
    .select({
      userId: userOrganizationMemberships.userId,
      role: userOrganizationMemberships.role,
      isActive: userOrganizationMemberships.isActive,
    })
    .from(userOrganizationMemberships)
    .where(
      and(
        eq(userOrganizationMemberships.userId, userId),
        eq(userOrganizationMemberships.organizationId, organizationId),
      ),
    )
    .limit(1)
  return row ?? null
}
