// @govcore/content/relationships — typed query helpers for `link` (to-many).
//
// A `link` field is stored in a junction table (built by `buildLinkTable`). These
// helpers add/remove/list links over it, db-injected like the rest of GovCore.
// They run inside the caller's tenant transaction, so RLS scopes every row to
// the active org — a link is org-scoped (cross-org links are @govcore/federation).

import { and, eq } from 'drizzle-orm'
import type { GovcoreDb } from '@govcore/schema'
import type { buildLinkTable } from './table'

export type LinkTable = ReturnType<typeof buildLinkTable>

export interface AddLinkParams {
  sourceId: string
  targetId: string
  organizationId: string
}

/** Add a to-many link. Idempotent — the (source, target) primary key dedupes. */
export async function addLink(db: GovcoreDb, junction: LinkTable, params: AddLinkParams): Promise<void> {
  await db
    .insert(junction)
    .values({
      sourceId: params.sourceId,
      targetId: params.targetId,
      organizationId: params.organizationId,
    })
    .onConflictDoNothing()
}

/** Remove a link. No-op when it doesn't exist. */
export async function removeLink(
  db: GovcoreDb,
  junction: LinkTable,
  sourceId: string,
  targetId: string,
): Promise<void> {
  await db
    .delete(junction)
    .where(and(eq(junction.sourceId, sourceId), eq(junction.targetId, targetId)))
}

/** The target ids linked from `sourceId`. */
export async function listLinkedIds(
  db: GovcoreDb,
  junction: LinkTable,
  sourceId: string,
): Promise<string[]> {
  const rows = await db
    .select({ targetId: junction.targetId })
    .from(junction)
    .where(eq(junction.sourceId, sourceId))
  return rows.map((r) => r.targetId)
}
