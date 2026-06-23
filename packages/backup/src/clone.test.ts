import { describe, expect, it } from 'vitest'
import { registerBackupTables, type BackupTable } from './registry'
import { buildIdMaps, remapRowIds } from './clone'

// Fake table metadata — the pure helpers only read name/pkField/orgField/references.
const tbl = {} as BackupTable['table']
const col = {} as BackupTable['orgColumn']
const parent: BackupTable = { name: 'parent', table: tbl, orgColumn: col }
const child: BackupTable = {
  name: 'child',
  table: tbl,
  orgColumn: col,
  references: [{ field: 'parentId', table: 'parent' }],
}
const registry = registerBackupTables([parent, child])

// Deterministic id generator for assertions.
const seqId = () => {
  let n = 0
  return () => `new-${++n}`
}

const bundle = {
  envelope: { format: '1.0', shape: 'archive', exportedAt: '', orgId: 'src', tableNames: [] },
  data: {
    parent: [{ id: 'p1', organizationId: 'src' }, { id: 'p2', organizationId: 'src' }],
    child: [{ id: 'c1', organizationId: 'src', parentId: 'p1' }],
  },
} as const

describe('buildIdMaps', () => {
  it('maps every row pk to a fresh id, per table', () => {
    const maps = buildIdMaps(registry, bundle as never, seqId())
    expect([...maps.parent.keys()]).toEqual(['p1', 'p2'])
    expect([...maps.child.keys()]).toEqual(['c1'])
    expect(maps.parent.get('p1')).toBe('new-1')
    expect(maps.parent.get('p2')).toBe('new-2')
    expect(maps.child.get('c1')).toBe('new-3')
  })
})

describe('remapRowIds', () => {
  const idMaps = {
    parent: new Map([['p1', 'P1'], ['p2', 'P2']]),
    child: new Map([['c1', 'C1']]),
  }

  it('regenerates the pk and remaps the org field', () => {
    const out = remapRowIds({ id: 'p1', organizationId: 'src' }, parent, idMaps, 'dest')
    expect(out).toEqual({ id: 'P1', organizationId: 'dest' })
  })

  it('remaps a declared reference to the parent table’s new id', () => {
    const out = remapRowIds(
      { id: 'c1', organizationId: 'src', parentId: 'p1' },
      child,
      idMaps,
      'dest',
    )
    expect(out).toMatchObject({ id: 'C1', organizationId: 'dest', parentId: 'P1' })
  })

  it('leaves a reference whose value is not in the bundle unchanged', () => {
    const out = remapRowIds(
      { id: 'c1', organizationId: 'src', parentId: 'external' },
      child,
      idMaps,
      'dest',
    )
    expect(out.parentId).toBe('external')
  })

  it('applies forceFields and does not mutate the input row', () => {
    const row = { id: 'c1', organizationId: 'src', parentId: 'p1', createdBy: 'old' }
    const out = remapRowIds(row, child, idMaps, 'dest', { createdBy: 'importer' })
    expect(out.createdBy).toBe('importer')
    expect(row).toEqual({ id: 'c1', organizationId: 'src', parentId: 'p1', createdBy: 'old' })
  })

  it('honors custom pkField / orgField', () => {
    const t: BackupTable = { name: 'parent', table: tbl, orgColumn: col, pkField: 'uuid', orgField: 'orgId' }
    const out = remapRowIds({ uuid: 'p1', orgId: 'src' }, t, idMaps, 'dest')
    expect(out).toEqual({ uuid: 'P1', orgId: 'dest' })
  })
})
