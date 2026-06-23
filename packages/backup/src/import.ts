// @govcore/backup/import — destructive same-org restore from a bundle.
//
// Restore is destructive by contract: it replaces the target org's content with
// the bundle's. The caller is responsible for confirmation (typed token, etc.).
// UUIDs are preserved — the org is wiped first, so the export's ids can be
// replayed verbatim and junctions stay valid without remapping. Cross-org UUID
// remapping (importing into an org that still holds the source rows) is out of
// scope, exactly as in the source implementation this generalizes.

import { eq } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { GovcoreDb } from '@govcore/schema'
import {
  BACKUP_FORMAT_VERSION,
  type BackupBundle,
  type BackupRegistry,
} from './registry'

export class BackupImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupImportError'
  }
}

export interface ImportOptions {
  /** The org being restored into. Every inserted row's org field is set to this. */
  targetOrgId: string
  /**
   * Fields forced onto every inserted row (e.g. `{ createdBy: importerId }`) —
   * source actor ids may not exist in the destination, so credit the importer.
   */
  forceFields?: Record<string, unknown>
}

export interface ImportResult {
  deleted: Record<string, number>
  inserted: Record<string, number>
}

/** Throw unless the bundle carries a compatible envelope. */
export function assertCompatible(bundle: BackupBundle): void {
  const env = bundle?.envelope
  if (!env || typeof env !== 'object') throw new BackupImportError('Missing or invalid envelope')
  if (env.format !== BACKUP_FORMAT_VERSION) {
    throw new BackupImportError(
      `Unsupported backup format "${env.format}" (expected ${BACKUP_FORMAT_VERSION})`,
    )
  }
}

/**
 * Pure: clone rows with the org field remapped to `targetOrgId` and any forced
 * fields applied. Does not mutate the input rows.
 */
export function remapRows(
  rows: unknown[],
  orgField: string,
  targetOrgId: string,
  forceFields?: Record<string, unknown>,
): Record<string, unknown>[] {
  return rows.map((r) => ({
    ...(r as Record<string, unknown>),
    [orgField]: targetOrgId,
    ...(forceFields ?? {}),
  }))
}

/**
 * Destructive same-org restore inside a single transaction:
 *   1. wipe the target org's rows for every registered table, children first
 *      (reverse dependency order);
 *   2. re-insert the bundle's rows, parents first (forward order), remapping the
 *      org id and preserving UUIDs.
 * If anything throws, the whole restore rolls back.
 */
export async function importOrg(
  db: GovcoreDb,
  registry: BackupRegistry,
  bundle: BackupBundle,
  opts: ImportOptions,
): Promise<ImportResult> {
  assertCompatible(bundle)
  const deleted: Record<string, number> = {}
  const inserted: Record<string, number> = {}

  await db.transaction(async (tx) => {
    for (const t of [...registry.tables].reverse()) {
      const res = await tx
        .delete(t.table as PgTable)
        .where(eq(t.orgColumn, opts.targetOrgId))
        .returning()
      deleted[t.name] = (res as unknown[]).length
    }

    for (const t of registry.tables) {
      const rows = bundle.data[t.name] ?? []
      if (rows.length === 0) {
        inserted[t.name] = 0
        continue
      }
      const remapped = remapRows(rows, t.orgField ?? 'organizationId', opts.targetOrgId, opts.forceFields)
      await tx.insert(t.table as PgTable).values(remapped)
      inserted[t.name] = remapped.length
    }
  })

  return { deleted, inserted }
}
