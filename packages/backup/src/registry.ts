// @govcore/backup/registry — the table-registration contract.
//
// GovCore owns no app content, so backup can't enumerate tables the way a
// single app would. Instead the app *registers* its org-scoped tables in
// dependency order (parents before children, junctions last). That order is the
// answer to the FK-ordering question (§6.8): restore deletes in reverse and
// inserts forward, so a child never lands before its parent and never lingers
// after it.

import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core'

export type BackupCategory = 'config' | 'content'

export interface BackupTable {
  /** Stable key under which this table's rows live in the bundle. */
  name: string
  /** The Drizzle table. */
  table: PgTable
  /** Column holding the owning organization id — used to scope select/delete. */
  orgColumn: AnyPgColumn
  /** Row property holding the org id, remapped on import. Defaults to `organizationId`. */
  orgField?: string
  /** recipe (config) vs content classification. Defaults to `content`. */
  category?: BackupCategory
}

export interface BackupRegistry {
  /** Tables in dependency order: parents before children, junctions last. */
  tables: BackupTable[]
}

/**
 * Declare the org-scoped tables an app wants backed up, **in restore order**
 * (a parent must appear before any table that references it). Throws on a
 * duplicate `name`.
 */
export function registerBackupTables(tables: BackupTable[]): BackupRegistry {
  const seen = new Set<string>()
  for (const t of tables) {
    if (seen.has(t.name)) throw new Error(`registerBackupTables: duplicate table name "${t.name}"`)
    seen.add(t.name)
  }
  return { tables }
}

export const BACKUP_FORMAT_VERSION = '1.0' as const
export type BackupShape = 'recipe' | 'content' | 'archive'

export interface BackupEnvelope {
  format: typeof BACKUP_FORMAT_VERSION
  shape: BackupShape
  exportedAt: string
  orgId: string
  /** The table names present in `data`, in dependency order. */
  tableNames: string[]
}

export interface BackupBundle {
  envelope: BackupEnvelope
  data: Record<string, unknown[]>
}

/** Tables included for a shape: recipe→config, content→content, archive→all. */
export function tablesForShape(registry: BackupRegistry, shape: BackupShape): BackupTable[] {
  if (shape === 'archive') return registry.tables
  const want: BackupCategory = shape === 'recipe' ? 'config' : 'content'
  return registry.tables.filter((t) => (t.category ?? 'content') === want)
}
