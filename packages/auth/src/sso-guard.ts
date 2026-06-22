// @govcore/auth/sso-guard — invite-based SSO provisioning guard.
//
// An SSO identity may sign in only if a pre-provisioned, active user with an org
// binding already exists for its email. New SSO identities are blocked until an
// admin creates the matching account. (Email is globally unique, so a lookup by
// bare email is unambiguous.)

import { eq } from 'drizzle-orm'
import { users, type GovcoreDb } from '@govcore/schema'
import { resolveActiveMembership } from '@govcore/tenancy'

export type SsoCheckResult =
  | { status: 'allowed'; userId: string; organizationId: string; role: string }
  | { status: 'not_provisioned' }
  | { status: 'no_org_binding'; userId: string }
  | { status: 'deactivated'; userId: string }

/**
 * Whether an SSO identity (by email) may sign in. `allowed` only when a
 * pre-provisioned, active user with an org binding exists. Org binding resolves
 * through memberships first (same as the JWT callback), falling back to the
 * denormalized `users.organization_id`.
 */
export async function checkSsoProvisioning(db: GovcoreDb, email: string): Promise<SsoCheckResult> {
  const [dbUser] = await db.select().from(users).where(eq(users.email, email)).limit(1)

  if (!dbUser) return { status: 'not_provisioned' }
  if (!dbUser.isActive) return { status: 'deactivated', userId: dbUser.id }

  const membership = await resolveActiveMembership(db, dbUser.id, dbUser.lastActiveOrganizationId)
  if (membership) {
    return {
      status: 'allowed',
      userId: dbUser.id,
      organizationId: membership.organizationId,
      role: membership.role,
    }
  }

  if (!dbUser.organizationId) return { status: 'no_org_binding', userId: dbUser.id }

  return {
    status: 'allowed',
    userId: dbUser.id,
    organizationId: dbUser.organizationId,
    role: dbUser.role ?? '',
  }
}
