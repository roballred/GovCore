// @govcore/support/act-as — act-as sessions layered on break-glass.
//
// An act-as session is the actual "operate inside the target org" handle; it can
// only be opened while a usable break-glass session exists and can never outlive
// its parent. `getActiveActAsSession` is the authoritative termination point: if
// the parent was revoked or expired, it ends the act-as row on read, so a
// cross-tenant action gets the correct refusal with no background job.
//
// Framework-agnostic: the caller supplies the session id (e.g. from a cookie it
// owns — see ACT_AS_COOKIE); this package never touches request headers.

import { and, eq, gt, isNull } from 'drizzle-orm'
import {
  actAsSessions,
  breakGlassSessions,
  ACT_AS_DEFAULT_TTL_MINUTES,
  type ActAsEndReason,
  type GovcoreDb,
} from '@govcore/schema'
import { requireBreakGlass } from './break-glass'

export type ActAsSession = typeof actAsSessions.$inferSelect

/** Suggested cookie name for the app to carry the active act-as session id. */
export const ACT_AS_COOKIE = 'govcore_act_as'

/**
 * Pure: a child act-as session's expiry is the smaller of the requested window
 * and the parent break-glass session's remaining lifetime — it cannot outlive
 * its parent.
 */
export function clampActAsExpiry(opts: {
  ttlMinutes: number
  parentExpiresAt: Date
  now?: Date
}): Date {
  const now = opts.now ?? new Date()
  const requested = new Date(now.getTime() + opts.ttlMinutes * 60_000)
  return requested < opts.parentExpiresAt ? requested : opts.parentExpiresAt
}

/**
 * Resolve a session id to a live act-as row, re-verifying the parent break-glass
 * is still usable. If the parent is gone, ends this row (with the right reason)
 * and returns null.
 */
export async function getActiveActAsSession(
  db: GovcoreDb,
  sessionId: string | null | undefined,
): Promise<ActAsSession | null> {
  if (!sessionId) return null

  const [row] = await db
    .select()
    .from(actAsSessions)
    .where(
      and(
        eq(actAsSessions.id, sessionId),
        isNull(actAsSessions.endedAt),
        gt(actAsSessions.expiresAt, new Date()),
      ),
    )
    .limit(1)
  if (!row) return null

  const parent = await requireBreakGlass(db, row.instanceAdminId, row.targetOrgId)
  if (!parent) {
    const [parentRow] = await db
      .select({ revokedAt: breakGlassSessions.revokedAt })
      .from(breakGlassSessions)
      .where(eq(breakGlassSessions.id, row.breakGlassSessionId))
      .limit(1)
    const reason: ActAsEndReason = parentRow?.revokedAt ? 'parent_revoked' : 'parent_expired'
    await endActAsSessionRow(db, row.id, reason)
    return null
  }

  return row
}

/**
 * Throws unless there is a live act-as session for `targetOrgId`. Call at the
 * top of every cross-tenant mutation.
 */
export async function requireActAs(
  db: GovcoreDb,
  sessionId: string | null | undefined,
  targetOrgId: string,
): Promise<ActAsSession> {
  const session = await getActiveActAsSession(db, sessionId)
  if (!session) throw new Error('No active act-as session')
  if (session.targetOrgId !== targetOrgId) {
    throw new Error('Act-as session does not match target org')
  }
  return session
}

export interface StartActAsParams {
  instanceAdminId: string
  targetOrgId: string
  ttlMinutes?: number
}

/**
 * Start an act-as session. Returns null when the target is the admin's own org
 * (self-impersonation is a no-op) or when no usable break-glass session exists.
 * The child TTL is clamped to the parent's remaining lifetime.
 */
export async function startActAsSession(
  db: GovcoreDb,
  params: StartActAsParams,
  adminOrgId: string,
): Promise<ActAsSession | null> {
  if (params.targetOrgId === adminOrgId) return null

  const parent = await requireBreakGlass(db, params.instanceAdminId, params.targetOrgId)
  if (!parent) return null

  const expiresAt = clampActAsExpiry({
    ttlMinutes: params.ttlMinutes ?? ACT_AS_DEFAULT_TTL_MINUTES,
    parentExpiresAt: parent.expiresAt,
  })

  const [row] = await db
    .insert(actAsSessions)
    .values({
      breakGlassSessionId: parent.id,
      instanceAdminId: params.instanceAdminId,
      targetOrgId: params.targetOrgId,
      expiresAt,
    })
    .returning()
  return row
}

/** End an act-as session (idempotent — only ends a row that is still open). */
export async function endActAsSession(
  db: GovcoreDb,
  sessionId: string,
  reason: ActAsEndReason = 'admin_ended',
): Promise<void> {
  await endActAsSessionRow(db, sessionId, reason)
}

async function endActAsSessionRow(
  db: GovcoreDb,
  sessionId: string,
  reason: ActAsEndReason,
): Promise<void> {
  await db
    .update(actAsSessions)
    .set({ endedAt: new Date(), endReason: reason })
    .where(and(eq(actAsSessions.id, sessionId), isNull(actAsSessions.endedAt)))
}
