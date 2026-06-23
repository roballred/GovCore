// @govcore/backup/export — org-scoped extraction into a JSON-serializable bundle.

import { eq } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { GovcoreDb } from '@govcore/schema'
import {
  BACKUP_FORMAT_VERSION,
  tablesForShape,
  type BackupBundle,
  type BackupRegistry,
  type BackupShape,
} from './registry'

/**
 * Export one org's rows for every registered table in the requested shape. The
 * result is a plain object the caller can `JSON.stringify` with its own
 * indentation. Excludes (passwords, credentials, audit) are simply not
 * registered — there is one place to control that: the registry.
 */
export async function exportOrg(
  db: GovcoreDb,
  registry: BackupRegistry,
  orgId: string,
  shape: BackupShape = 'archive',
): Promise<BackupBundle> {
  const tables = tablesForShape(registry, shape)
  const data: Record<string, unknown[]> = {}

  for (const t of tables) {
    data[t.name] = await db
      .select()
      .from(t.table as PgTable)
      .where(eq(t.orgColumn, orgId))
  }

  return {
    envelope: {
      format: BACKUP_FORMAT_VERSION,
      shape,
      exportedAt: new Date().toISOString(),
      orgId,
      tableNames: tables.map((t) => t.name),
    },
    data,
  }
}
