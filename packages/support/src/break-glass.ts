// @govcore/support/break-glass — instance-operator break-glass elevation.
//
// Break-glass is an instance admin's time-boxed, audited grant of access to a
// single target org. It deliberately crosses the tenant boundary, so these
// tables are NOT under the org-GUC RLS (schema §6.6) — authorization lives here.
// A grant over the approval threshold needs a second admin's approval before it
// gates anything; TTL always counts from grant time, never approval time.

import { and, eq, gt, isNotNull, isNull, or } from 'drizzle-orm'
import { breakGlassSessions, type GovcoreDb } from '@govcore/schema'
import { writeAuditLog } from '@govcore/audit'

export type BreakGlassSession = typeof breakGlassSessions.$inferSelect

export const BREAK_GLASS_TTL_PRESETS = [60, 240, 480] as const
export type BreakGlassTtlMinutes = (typeof BREAK_GLASS_TTL_PRESETS)[number]
export const BREAK_GLASS_DEFAULT_TTL: BreakGlassTtlMinutes = 60
/** Grants longer than this require a second admin's approval. */
export const BREAK_GLASS_APPROVAL_THRESHOLD_MINUTES = 60

export function isValidBreakGlassTtl(value: number): value is BreakGlassTtlMinutes {
  return (BREAK_GLASS_TTL_PRESETS as readonly number[]).includes(value)
}

/**
 * Pure derivation of a grant's approval requirement and expiry. TTL counts from
 * `grantedAt` (not approval), so pre-staging an approval can never extend the
 * elevation window beyond what was requested.
 */
export function computeBreakGlassGrant(opts: { ttlMinutes: number; grantedAt: Date }): {
  requiresApproval: boolean
  expiresAt: Date
} {
  return {
    requiresApproval: opts.ttlMinutes > BREAK_GLASS_APPROVAL_THRESHOLD_MINUTES,
    expiresAt: new Date(opts.grantedAt.getTime() + opts.ttlMinutes * 60_000),
  }
}

const isUsable = (adminId: string, orgId?: string) =>
  and(
    eq(breakGlassSessions.instanceAdminId, adminId),
    orgId ? eq(breakGlassSessions.targetOrgId, orgId) : undefined,
    isNull(breakGlassSessions.revokedAt),
    gt(breakGlassSessions.expiresAt, new Date()),
    // A grant requiring approval only counts once approved.
    or(eq(breakGlassSessions.requiresApproval, false), isNotNull(breakGlassSessions.approvedAt)),
  )

/**
 * The active, approved, non-expired break-glass session for `adminId` + `orgId`,
 * or null. A pending-approval session does NOT satisfy this — it must be
 * approved first. This is the gate cross-tenant flows consult.
 */
export async function requireBreakGlass(
  db: GovcoreDb,
  adminId: string,
  orgId: string,
): Promise<BreakGlassSession | null> {
  const [session] = await db
    .select()
    .from(breakGlassSessions)
    .where(isUsable(adminId, orgId))
    .limit(1)
  return session ?? null
}

/**
 * Org IDs the admin currently holds usable break-glass for — the multi-org
 * variant of `requireBreakGlass` for filtering a list without N round-trips.
 * Pending-approval, expired, and revoked sessions do not count.
 */
export async function getUnlockedOrgIds(db: GovcoreDb, adminId: string): Promise<Set<string>> {
  const rows = await db
    .select({ targetOrgId: breakGlassSessions.targetOrgId })
    .from(breakGlassSessions)
    .where(isUsable(adminId))
  return new Set(rows.map((r) => r.targetOrgId))
}

export interface GrantBreakGlassParams {
  instanceAdminId: string
  targetOrgId: string
  reason: string
  ttlMinutes?: number
}

/** Open a break-glass session. Validates reason + TTL, derives approval/expiry, and audits. */
export async function grantBreakGlass(
  db: GovcoreDb,
  params: GrantBreakGlassParams,
): Promise<BreakGlassSession> {
  const reason = params.reason.trim()
  if (!reason) throw new Error('Break-glass reason is required')
  const ttlMinutes = params.ttlMinutes ?? BREAK_GLASS_DEFAULT_TTL
  if (!isValidBreakGlassTtl(ttlMinutes)) {
    throw new Error(
      `Invalid break-glass TTL — must be one of ${BREAK_GLASS_TTL_PRESETS.join(', ')} minutes`,
    )
  }

  const grantedAt = new Date()
  const { requiresApproval, expiresAt } = computeBreakGlassGrant({ ttlMinutes, grantedAt })

  const [row] = await db
    .insert(breakGlassSessions)
    .values({
      instanceAdminId: params.instanceAdminId,
      targetOrgId: params.targetOrgId,
      reason,
      grantedAt,
      expiresAt,
      requiresApproval,
    })
    .returning()

  await writeAuditLog(db, {
    action: 'support.break_glass.grant',
    entityType: 'organization',
    entityId: params.targetOrgId,
    userId: params.instanceAdminId,
    organizationId: null,
    after: { reason, ttlMinutes, expiresAt, sessionId: row.id, requiresApproval },
  })
  return row
}

/**
 * Pure approval guard. Throws when `approverId` may not approve `session` now:
 * no self-approval, the grant must actually require approval, and it must not be
 * already approved, revoked, or expired.
 */
export function assertApprovable(
  session: Pick<
    BreakGlassSession,
    'instanceAdminId' | 'requiresApproval' | 'approvedAt' | 'revokedAt' | 'expiresAt'
  >,
  approverId: string,
  now: Date = new Date(),
): void {
  if (session.instanceAdminId === approverId) {
    throw new Error('Cannot approve your own break-glass session')
  }
  if (!session.requiresApproval) throw new Error('Session does not require approval')
  if (session.approvedAt) throw new Error('Session is already approved')
  if (session.revokedAt) throw new Error('Session is revoked')
  if (session.expiresAt <= now) throw new Error('Session has expired')
}

/** Approve a pending break-glass session as a second admin. Audited. */
export async function approveBreakGlass(
  db: GovcoreDb,
  params: { sessionId: string; approverId: string },
): Promise<BreakGlassSession> {
  const [target] = await db
    .select()
    .from(breakGlassSessions)
    .where(eq(breakGlassSessions.id, params.sessionId))
    .limit(1)
  if (!target) throw new Error('Break-glass session not found')
  assertApprovable(target, params.approverId)

  const approvedAt = new Date()
  const [row] = await db
    .update(breakGlassSessions)
    .set({ approvedAt, approvedBy: params.approverId })
    .where(eq(breakGlassSessions.id, params.sessionId))
    .returning()

  await writeAuditLog(db, {
    action: 'support.break_glass.approve',
    entityType: 'break_glass_session',
    entityId: params.sessionId,
    userId: params.approverId,
    organizationId: null,
    after: { approvedAt, granterId: target.instanceAdminId, targetOrgId: target.targetOrgId },
  })
  return row
}

/**
 * Revoke a break-glass session. Only the granting admin may revoke their own
 * session; returns null when nothing matched. Audited when a row is revoked.
 */
export async function revokeBreakGlass(
  db: GovcoreDb,
  params: { sessionId: string; instanceAdminId: string },
): Promise<BreakGlassSession | null> {
  const [row] = await db
    .update(breakGlassSessions)
    .set({ revokedAt: new Date(), revokedBy: params.instanceAdminId })
    .where(
      and(
        eq(breakGlassSessions.id, params.sessionId),
        eq(breakGlassSessions.instanceAdminId, params.instanceAdminId),
      ),
    )
    .returning()
  if (!row) return null

  await writeAuditLog(db, {
    action: 'support.break_glass.revoke',
    entityType: 'break_glass_session',
    entityId: params.sessionId,
    userId: params.instanceAdminId,
    organizationId: null,
  })
  return row
}
