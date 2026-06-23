// @govcore/backup/clone — cross-org clone with UUID remapping.
//
// `importOrg` restores a bundle into its own org and preserves UUIDs (safe,
// because the target is wiped first). To copy an org's content into a *different*
// org you can't preserve ids — globally-unique primary keys would collide with
// the still-present source. So clone regenerates every row's primary key, builds
// an old→new map per table, and rewrites declared foreign-key references to point
// at the cloned rows. Inserts run parents→children so FKs resolve. It is additive
// (no wipe): the clone coexists with the source.
//
// References to rows outside the bundle (e.g. `createdBy` → users) are left as-is;
// set them with `forceFields` if they must point somewhere valid in the target.

import { randomUUID } from 'node:crypto'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { GovcoreDb } from '@govcore/schema'
import { type BackupBundle, type BackupRegistry, type BackupTable } from './registry'
import { assertCompatible } from './import'

export interface CloneOptions {
  /** The org the content is cloned into. */
  targetOrgId: string
  /** Fields forced onto every inserted row (e.g. `{ createdBy: importerId }`). */
  forceFields?: Record<string, unknown>
  /** Id generator; defaults to `crypto.randomUUID`. Injectable for deterministic tests. */
  newId?: () => string
}

export interface CloneResult {
  inserted: Record<string, number>
  /** old pk → new pk, per registered table name. */
  idMap: Record<string, Record<string, string>>
}

const pkOf = (t: BackupTable) => t.pkField ?? 'id'
const orgOf = (t: BackupTable) => t.orgField ?? 'organizationId'

/**
 * Pure: build an old→new id map for every registered table's rows. A row missing
 * its primary key is skipped (nothing to map).
 */
export function buildIdMaps(
  registry: BackupRegistry,
  bundle: BackupBundle,
  newId: () => string = randomUUID,
): Record<string, Map<string, string>> {
  const maps: Record<string, Map<string, string>> = {}
  for (const t of registry.tables) {
    const map = new Map<string, string>()
    const pk = pkOf(t)
    for (const row of bundle.data[t.name] ?? []) {
      const oldId = (row as Record<string, unknown>)[pk]
      if (typeof oldId === 'string') map.set(oldId, newId())
    }
    maps[t.name] = map
  }
  return maps
}

/**
 * Pure: clone a single row for cross-org insert — new primary key, org field set
 * to `targetOrgId`, declared references remapped via the referenced table's map,
 * and `forceFields` applied. Does not mutate the input. A reference whose value
 * isn't in the bundle is left unchanged.
 */
export function remapRowIds(
  row: unknown,
  table: BackupTable,
  idMaps: Record<string, Map<string, string>>,
  targetOrgId: string,
  forceFields?: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(row as Record<string, unknown>) }
  const pk = pkOf(table)

  const oldPk = out[pk]
  if (typeof oldPk === 'string') {
    const mapped = idMaps[table.name]?.get(oldPk)
    if (mapped) out[pk] = mapped
  }

  out[orgOf(table)] = targetOrgId

  for (const ref of table.references ?? []) {
    const current = out[ref.field]
    if (typeof current === 'string') {
      const mapped = idMaps[ref.table]?.get(current)
      if (mapped) out[ref.field] = mapped
    }
  }

  return { ...out, ...(forceFields ?? {}) }
}

/**
 * Clone one org's exported content into `targetOrgId` with regenerated ids, in a
 * single transaction. Returns the per-table insert counts and the old→new id maps.
 */
export async function cloneOrgInto(
  db: GovcoreDb,
  registry: BackupRegistry,
  bundle: BackupBundle,
  opts: CloneOptions,
): Promise<CloneResult> {
  assertCompatible(bundle)
  const idMaps = buildIdMaps(registry, bundle, opts.newId ?? randomUUID)
  const inserted: Record<string, number> = {}

  await db.transaction(async (tx) => {
    for (const t of registry.tables) {
      const rows = bundle.data[t.name] ?? []
      if (rows.length === 0) {
        inserted[t.name] = 0
        continue
      }
      const remapped = rows.map((r) => remapRowIds(r, t, idMaps, opts.targetOrgId, opts.forceFields))
      await tx.insert(t.table as PgTable).values(remapped)
      inserted[t.name] = remapped.length
    }
  })

  const idMap: Record<string, Record<string, string>> = {}
  for (const [name, map] of Object.entries(idMaps)) idMap[name] = Object.fromEntries(map)
  return { inserted, idMap }
}
