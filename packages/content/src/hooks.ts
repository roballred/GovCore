// @govcore/content/hooks — the per-type escape hatch to real code (Rule 3).
//
// The engine generates the 80% (storage, RLS, lifecycle); the 20% that makes
// content rich — publish-readiness gates, reactions, roll-up refreshes — plugs
// in here as typed hooks that run real server code with the real (tenant) db.
// `transition` is the lifecycle engine: it enforces the workflow and invokes the
// hooks; a `beforePublish` that throws blocks the publish. The engine is the seam
// for that logic, never the place it lives.

import { eq } from 'drizzle-orm'
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core'
import type { GovcoreDb } from '@govcore/schema'
import { canTransition, type WorkflowStatus } from './workflow'
import type { ContentTypeDefinition } from './types'

export interface HookContext {
  /** The real (tenant) db handle — run any server logic against it. */
  db: GovcoreDb
  def: ContentTypeDefinition
  id: string
  /** The row as loaded before the transition. */
  row: Record<string, unknown>
  from: WorkflowStatus
  to: WorkflowStatus
}

export type ContentHook = (ctx: HookContext) => void | Promise<void>

export interface ContentHooks {
  /** Runs before a `→ published` transition; throw to block (publish-readiness gate). */
  beforePublish?: ContentHook
  /** Runs after a successful `→ published` transition. */
  afterPublish?: ContentHook
  /** Runs after any successful status change. */
  afterChange?: ContentHook
}

/** Throw if `from → to` isn't an allowed lifecycle transition. */
export function assertTransition(
  def: ContentTypeDefinition,
  from: WorkflowStatus,
  to: WorkflowStatus,
): void {
  if (!canTransition(from, to)) {
    throw new Error(`@govcore/content: illegal transition ${from} → ${to} for "${def.name}"`)
  }
}

/**
 * Move a row through the lifecycle, enforcing the workflow and invoking the
 * type's hooks. A `beforePublish` hook that throws aborts the transition (and the
 * surrounding tenant transaction) — the publish-readiness gate. Returns the row
 * with its new status.
 */
export async function transition(
  db: GovcoreDb,
  table: PgTable,
  def: ContentTypeDefinition,
  params: { id: string; to: WorkflowStatus },
): Promise<Record<string, unknown>> {
  const idCol = (table as unknown as Record<string, AnyPgColumn>).id
  const [row] = await db.select().from(table).where(eq(idCol, params.id)).limit(1)
  if (!row) throw new Error(`@govcore/content: ${def.name} ${params.id} not found`)

  const current = row as Record<string, unknown>
  const from = current.status as WorkflowStatus
  assertTransition(def, from, params.to)

  const ctx: HookContext = { db, def, id: params.id, row: current, from, to: params.to }
  if (params.to === 'published') await def.hooks?.beforePublish?.(ctx)

  await db.update(table).set({ status: params.to, updatedAt: new Date() }).where(eq(idCol, params.id))

  if (params.to === 'published') await def.hooks?.afterPublish?.(ctx)
  await def.hooks?.afterChange?.(ctx)

  return { ...current, status: params.to }
}

/** Convenience: transition a row to `published` (runs the publish gate + hooks). */
export function publish(db: GovcoreDb, table: PgTable, def: ContentTypeDefinition, id: string) {
  return transition(db, table, def, { id, to: 'published' })
}

/** Convenience: transition a row to `archived`. */
export function archive(db: GovcoreDb, table: PgTable, def: ContentTypeDefinition, id: string) {
  return transition(db, table, def, { id, to: 'archived' })
}
