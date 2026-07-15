// @govcore/auth/provisioning — create a user with an initial password + membership.
//
// The operator "add user" flow every console rebuilds (GovEA `actions/users.ts`,
// GovCRM `lib/platform.ts`). It lives in @govcore/auth rather than @govcore/tenancy
// because it hashes a password — tenancy must not depend on auth (auth already
// depends on tenancy). Validates against the policy, hashes, inserts the user,
// and writes the membership through tenancy's upsertMembership so the row is
// authoritative at session resolution. Audits `platform.user.create` — never the
// password. A duplicate email returns a typed result, not a 500.

import { users, isUniqueViolation, type GovcoreDb } from '@govcore/schema'
import { writeAuditLog, composeAuditMetadata } from '@govcore/audit'
import { upsertMembership } from '@govcore/tenancy'
import { hashPassword, validatePassword, type PasswordPolicy } from './password'

export type ProvisionUserResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'missing-fields' | 'weak-password'; message?: string }
  | { ok: false; reason: 'email-taken' }

/**
 * Provision a new user in `organizationId` with an initial password and a
 * primary membership at `role`. `instanceAdmin` grants the platform-level role.
 * The initial password is validated against `policy` (falls back to the global
 * minimum) and hashed at `rounds` (defaults to the module default). Attribute
 * the audit to the operator via `actorUserId`. `auditMetadata`/`reason` attach
 * optional incident-review context to the audit event (#121).
 */
export async function provisionUser(
  db: GovcoreDb,
  opts: {
    email: string
    name?: string | null
    organizationId: string
    role: string
    instanceAdmin?: boolean
    password: string
    actorUserId: string
    policy?: PasswordPolicy | null
    rounds?: number
    auditMetadata?: Record<string, unknown> | null
    reason?: string | null
  },
): Promise<ProvisionUserResult> {
  const email = opts.email.trim().toLowerCase()
  if (!email || !opts.organizationId) {
    return { ok: false, reason: 'missing-fields' }
  }

  const validation = validatePassword(opts.password, opts.policy)
  if (!validation.valid) {
    return { ok: false, reason: 'weak-password', message: validation.message }
  }

  const passwordHash = await hashPassword(opts.password, opts.rounds)

  try {
    const userId = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          email,
          name: opts.name?.trim() || null,
          organizationId: opts.organizationId,
          role: opts.role,
          instanceRole: opts.instanceAdmin ? 'instance_admin' : null,
          passwordHash,
        })
        .returning()
      await upsertMembership(tx, {
        userId: user.id,
        organizationId: opts.organizationId,
        role: opts.role,
        isPrimary: true,
      })
      await writeAuditLog(tx, {
        action: 'platform.user.create',
        entityType: 'user',
        entityId: user.id,
        organizationId: opts.organizationId,
        userId: opts.actorUserId,
        after: { email, role: opts.role, instanceRole: user.instanceRole }, // never the password
        metadata: composeAuditMetadata(opts.auditMetadata, opts.reason),
      })
      return user.id
    })
    return { ok: true, userId }
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: 'email-taken' }
    throw err
  }
}
