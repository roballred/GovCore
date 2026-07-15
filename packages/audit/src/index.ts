// @govcore/audit — the audit-log writer.
//
// The append-only guarantee itself is a Postgres trigger shipped by
// @govcore/schema (migration 0001); this package is the typed writer + a small
// read helper. Pass either the db or a transaction handle: when called inside a
// transaction the audit insert participates in it — if the mutation rolls back,
// the audit row never appears, and vice versa. Audit writes are first-class
// data-integrity work, not best-effort (no fail-silent catch).

import { auditLog, type GovcoreDb } from '@govcore/schema'
import { desc, eq } from 'drizzle-orm'

export interface AuditEvent {
  action: string
  entityType: string
  entityId?: string | null
  userId?: string | null
  organizationId?: string | null
  before?: unknown
  after?: unknown
  metadata?: Record<string, unknown>
}

/** Write one audit row. Use the same `tx` as the companion mutation when there is one. */
export async function writeAuditLog(db: GovcoreDb, event: AuditEvent): Promise<void> {
  await db.insert(auditLog).values({
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    userId: event.userId ?? null,
    organizationId: event.organizationId ?? null,
    before: event.before ?? null,
    after: event.after ?? null,
    metadata: event.metadata ?? null,
  })
}

/**
 * Compose an audit event's `metadata` from a consumer's request-context object
 * and an optional operator reason (#121).
 *
 * The operator-plane mutations own their audit write, so a consumer that wants
 * to record incident-review context — the source IP and user-agent an instance
 * console captures, plus the operator's stated reason — has no other way in.
 * Callers pass a plain object (core never touches request headers) and/or a
 * reason; both land in one `metadata` object, with `reason` normalized to a
 * trimmed `metadata.reason`.
 *
 * Returns `undefined` when neither yields anything, so the result can go
 * straight to {@link writeAuditLog} and produce a `null` metadata column —
 * identical to omitting the context entirely (no behavior change for callers
 * that pass nothing).
 */
export function composeAuditMetadata(
  auditMetadata?: Record<string, unknown> | null,
  reason?: string | null,
): Record<string, unknown> | undefined {
  const trimmedReason = reason?.trim()
  const merged = {
    ...(auditMetadata ?? {}),
    ...(trimmedReason ? { reason: trimmedReason } : {}),
  }
  return Object.keys(merged).length > 0 ? merged : undefined
}

/** Most-recent audit rows for an organization (newest first). */
export async function listAuditForOrg(db: GovcoreDb, organizationId: string, limit = 100) {
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.organizationId, organizationId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
}
