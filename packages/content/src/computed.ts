// @govcore/content/computed — derived fields (Rule 2).
//
// A computed field is declared with a pure `compute(row)` function. Two modes,
// chosen per field: computed-on-read (`withComputed`) augments a stored row at
// read time; materialized stores the value in a real column that the engine
// refreshes via `recompute` — the recompute/cache plumbing apps would otherwise
// hand-roll. The compute functions stay pure; only `recompute` touches the db.

import { eq } from 'drizzle-orm'
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core'
import type { GovcoreDb } from '@govcore/schema'
import type { ContentTypeDefinition } from './types'

type Row = Record<string, unknown>

/** Pure: all computed values (materialized or not) for a stored row, keyed by name. */
export function computeFields(def: ContentTypeDefinition, row: Row): Row {
  const out: Row = {}
  for (const c of def.computed ?? []) out[c.name] = c.compute(row)
  return out
}

/** Pure: the stored row augmented with its computed-on-read values. */
export function withComputed(def: ContentTypeDefinition, row: Row): Row {
  return { ...row, ...computeFields(def, row) }
}

/** Pure: only the materialized computed values — what `recompute` persists. */
export function materializedValues(def: ContentTypeDefinition, row: Row): Row {
  const out: Row = {}
  for (const c of def.computed ?? []) if (c.materialized) out[c.name] = c.compute(row)
  return out
}

/**
 * Refresh the materialized computed columns of one row: read it, recompute, and
 * write the materialized values back. No-op when the row is missing or the type
 * has no materialized computed fields. Runs on the caller's (tenant) db handle.
 */
export async function recompute(
  db: GovcoreDb,
  table: PgTable,
  def: ContentTypeDefinition,
  id: string,
): Promise<void> {
  const idCol = (table as unknown as Record<string, AnyPgColumn>).id
  const [row] = await db.select().from(table).where(eq(idCol, id)).limit(1)
  if (!row) return
  const values = materializedValues(def, row as Row)
  if (Object.keys(values).length === 0) return
  await db.update(table).set(values).where(eq(idCol, id))
}
