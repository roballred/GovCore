import { describe, expect, it } from 'vitest'
import { registerBackupTables, tablesForShape, type BackupTable } from './registry'

// A fake column/table is enough for the pure registry helpers — they never
// touch the DB, only the entry metadata (name, category).
const col = {} as BackupTable['orgColumn']
const tbl = {} as BackupTable['table']
const entry = (name: string, category?: BackupTable['category']): BackupTable => ({
  name,
  table: tbl,
  orgColumn: col,
  category,
})

describe('registerBackupTables', () => {
  it('preserves declaration (dependency) order', () => {
    const reg = registerBackupTables([entry('a'), entry('b'), entry('c')])
    expect(reg.tables.map((t) => t.name)).toEqual(['a', 'b', 'c'])
  })

  it('throws on a duplicate table name', () => {
    expect(() => registerBackupTables([entry('a'), entry('a')])).toThrow(/duplicate table name/)
  })
})

describe('tablesForShape', () => {
  const reg = registerBackupTables([
    entry('settings', 'config'),
    entry('taxonomy', 'config'),
    entry('items', 'content'),
    entry('links'), // defaults to content
  ])

  it('archive includes every table in order', () => {
    expect(tablesForShape(reg, 'archive').map((t) => t.name)).toEqual([
      'settings',
      'taxonomy',
      'items',
      'links',
    ])
  })

  it('recipe includes only config tables', () => {
    expect(tablesForShape(reg, 'recipe').map((t) => t.name)).toEqual(['settings', 'taxonomy'])
  })

  it('content includes content tables (including the default category)', () => {
    expect(tablesForShape(reg, 'content').map((t) => t.name)).toEqual(['items', 'links'])
  })
})
