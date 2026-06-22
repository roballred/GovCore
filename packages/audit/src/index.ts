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

/** Most-recent audit rows for an organization (newest first). */
export async function listAuditForOrg(db: GovcoreDb, organizationId: string, limit = 100) {
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.organizationId, organizationId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
}
