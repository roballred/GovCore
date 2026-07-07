// @govcore/support/views — read + status layer for the support-session surfaces.
//
// The break-glass/act-as *lifecycle* lives in ./break-glass and ./act-as; what
// every consumer additionally rebuilds is (a) deriving a session's display
// status and (b) querying sessions for the operator console and — the part
// nothing in core previously enabled — the tenant-side visibility panel (an org
// admin seeing that an operator accessed their data). Both live here so the two
// screens are driven by one source of truth.

import { desc, eq } from 'drizzle-orm'
import {
  actAsSessions,
  breakGlassSessions,
  type ActAsSession,
  type BreakGlassSession,
  type GovcoreDb,
} from '@govcore/schema'

export type BreakGlassStatus = 'active' | 'pending' | 'expired' | 'revoked'
export type ActAsStatus = 'active' | 'expired' | 'ended'
export type SupportSessionStatus = BreakGlassStatus | ActAsStatus

/**
 * Pure: a break-glass session's display status. Revocation and expiry win over
 * a pending approval (a grant that expired before it was approved is expired,
 * not still pending). `active` is the alarming state — an operator currently
 * holds access.
 */
export function breakGlassStatus(
  session: Pick<BreakGlassSession, 'revokedAt' | 'expiresAt' | 'requiresApproval' | 'approvedAt'>,
  now: Date = new Date(),
): BreakGlassStatus {
  if (session.revokedAt) return 'revoked'
  if (session.expiresAt.getTime() <= now.getTime()) return 'expired'
  if (session.requiresApproval && !session.approvedAt) return 'pending'
  return 'active'
}

/**
 * Pure: an act-as session's display status. An explicitly ended session reads
 * `ended` regardless of its clock; otherwise it is `expired` past its window,
 * else `active`.
 */
export function actAsStatus(
  session: Pick<ActAsSession, 'endedAt' | 'expiresAt'>,
  now: Date = new Date(),
): ActAsStatus {
  if (session.endedAt) return 'ended'
  if (session.expiresAt.getTime() <= now.getTime()) return 'expired'
  return 'active'
}

/**
 * List break-glass sessions, newest first. With `targetOrgId` this is the
 * **tenant-visibility** query — the sessions into one organization, for that
 * org's admins to see. Without it, the operator's cross-tenant console view.
 */
export async function listBreakGlassSessions(
  db: GovcoreDb,
  opts: { targetOrgId?: string; limit?: number } = {},
): Promise<BreakGlassSession[]> {
  return db
    .select()
    .from(breakGlassSessions)
    .where(opts.targetOrgId ? eq(breakGlassSessions.targetOrgId, opts.targetOrgId) : undefined)
    .orderBy(desc(breakGlassSessions.grantedAt))
    .limit(opts.limit ?? 50)
}

/**
 * List act-as sessions, newest first. `targetOrgId` scopes to one organization
 * (tenant visibility); omit it for the operator console view.
 */
export async function listActAsSessions(
  db: GovcoreDb,
  opts: { targetOrgId?: string; limit?: number } = {},
): Promise<ActAsSession[]> {
  return db
    .select()
    .from(actAsSessions)
    .where(opts.targetOrgId ? eq(actAsSessions.targetOrgId, opts.targetOrgId) : undefined)
    .orderBy(desc(actAsSessions.startedAt))
    .limit(opts.limit ?? 50)
}

/**
 * True when an organization has any operator support access on record —
 * break-glass or act-as, regardless of current status. Cheap backing for a
 * tenant-side "has anyone accessed our data?" indicator; the healthy answer is
 * `false`.
 */
export async function orgHasSupportHistory(db: GovcoreDb, targetOrgId: string): Promise<boolean> {
  const [bg] = await db
    .select({ id: breakGlassSessions.id })
    .from(breakGlassSessions)
    .where(eq(breakGlassSessions.targetOrgId, targetOrgId))
    .limit(1)
  if (bg) return true
  const [aa] = await db
    .select({ id: actAsSessions.id })
    .from(actAsSessions)
    .where(eq(actAsSessions.targetOrgId, targetOrgId))
    .limit(1)
  return !!aa
}
