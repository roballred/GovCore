// @govcore/auth/password-flows — self-service change + operator reset.
//
// The policy validator and hashing already live in ./password; what every
// consumer rebuilt is the *flow* that composes them with the user row, the
// audit trail, and lockout state. GovEA has a change-password action; GovCRM
// shipped neither flow, leaving an account-recovery hole. Both flows below own
// the write over @govcore/schema.users, clear lockout on success, and never put
// a password (plaintext or hash) in an audit payload.

import { eq } from 'drizzle-orm'
import { users, type GovcoreDb } from '@govcore/schema'
import { writeAuditLog } from '@govcore/audit'
import { hashPassword, verifyPassword, validatePassword, type PasswordPolicy } from './password'

// Re-exported so `@govcore/auth/password-flows` is self-sufficient: consumers get
// the policy type from the same import-light subpath (no next-auth in the graph).
export type { PasswordPolicy } from './password'

/**
 * Result of a self-service change. `reason` is a stable code for routing (a
 * redirect, a field error); `message` is a human-readable default the caller
 * may surface as-is or replace.
 */
export type PasswordChangeResult =
  | { ok: true }
  | {
      ok: false
      reason: 'no-local-password' | 'current-incorrect' | 'weak-password' | 'reused'
      message: string
    }

/** Result of an operator-initiated reset (no current password required). */
export type PasswordResetResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'weak-password'; message: string }

/**
 * Self-service password change. Always verifies the current password — this is
 * the flow a user drives, or that a password-expiry redirect forces; it is
 * never how an operator resets someone else's password (that is
 * {@link adminResetPassword}).
 *
 * Order matters: a wrong current password is audited as a failed attempt (with
 * no password in the payload) before anything else; the new password is then
 * validated against `policy` and rejected if it merely repeats the current one.
 * `confirmPassword` matching is a UI concern and stays with the caller.
 */
export async function changePassword(
  db: GovcoreDb,
  opts: {
    userId: string
    currentPassword: string
    newPassword: string
    policy?: PasswordPolicy | null
    rounds?: number
  },
): Promise<PasswordChangeResult> {
  const [user] = await db.select().from(users).where(eq(users.id, opts.userId)).limit(1)
  if (!user || !user.passwordHash) {
    return {
      ok: false,
      reason: 'no-local-password',
      message: 'This account has no local password (SSO-only).',
    }
  }

  const currentValid = await verifyPassword(opts.currentPassword, user.passwordHash)
  if (!currentValid) {
    await writeAuditLog(db, {
      action: 'auth.password_change_failed',
      entityType: 'user',
      entityId: user.id,
      userId: user.id,
      organizationId: user.organizationId,
      metadata: { reason: 'current_password_mismatch' },
    })
    return { ok: false, reason: 'current-incorrect', message: 'Current password is incorrect.' }
  }

  const validation = validatePassword(opts.newPassword, opts.policy)
  if (!validation.valid) {
    return { ok: false, reason: 'weak-password', message: validation.message }
  }

  // Bare-minimum reuse check: the new password must differ from the current one.
  // A full N-password history is a separate feature (extra storage).
  if (await verifyPassword(opts.newPassword, user.passwordHash)) {
    return {
      ok: false,
      reason: 'reused',
      message: 'New password must differ from the current password.',
    }
  }

  await applyNewPassword(db, {
    userId: user.id,
    organizationId: user.organizationId,
    newHash: await hashPassword(opts.newPassword, opts.rounds),
    action: 'auth.password_changed',
    actorUserId: user.id,
  })
  return { ok: true }
}

/**
 * Operator-initiated reset: sets a new password for `userId` without knowing
 * the current one. Audited as `auth.password_reset` attributed to
 * `actorUserId` (the operator), so a reset is never indistinguishable from the
 * user changing their own password. Enforces the same policy as the
 * self-service flow — an operator reset is not a policy bypass.
 */
export async function adminResetPassword(
  db: GovcoreDb,
  opts: {
    userId: string
    newPassword: string
    actorUserId: string
    policy?: PasswordPolicy | null
    rounds?: number
  },
): Promise<PasswordResetResult> {
  const [user] = await db.select().from(users).where(eq(users.id, opts.userId)).limit(1)
  if (!user) {
    return { ok: false, reason: 'not-found', message: 'That user no longer exists.' }
  }

  const validation = validatePassword(opts.newPassword, opts.policy)
  if (!validation.valid) {
    return { ok: false, reason: 'weak-password', message: validation.message }
  }

  await applyNewPassword(db, {
    userId: user.id,
    organizationId: user.organizationId,
    newHash: await hashPassword(opts.newPassword, opts.rounds),
    action: 'auth.password_reset',
    actorUserId: opts.actorUserId,
    metadata: { by: opts.actorUserId },
  })
  return { ok: true }
}

/**
 * Shared write: rehash into the user row, stamp `lastPasswordChangedAt`, clear
 * any lingering lockout (a successful set proves control of the account), and
 * audit — all in one transaction so the row and its audit event commit
 * together. The audit event never carries the password.
 */
async function applyNewPassword(
  db: GovcoreDb,
  opts: {
    userId: string
    // Nullable: a platform-only operator has no home org (#104). The audit log's
    // organization_id is nullable, so the change/reset event records null.
    organizationId: string | null
    newHash: string
    action: string
    actorUserId: string
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  const now = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        passwordHash: opts.newHash,
        lastPasswordChangedAt: now,
        failedLoginAttempts: 0,
        lockoutUntil: null,
        updatedAt: now,
      })
      .where(eq(users.id, opts.userId))
    await writeAuditLog(tx, {
      action: opts.action,
      entityType: 'user',
      entityId: opts.userId,
      userId: opts.actorUserId,
      organizationId: opts.organizationId,
      metadata: opts.metadata,
    })
  })
}
