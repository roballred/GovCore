import { describe, expect, it } from 'vitest'
import { BACKUP_FORMAT_VERSION, type BackupBundle } from './registry'
import { assertCompatible, remapRows } from './import'

const bundle = (overrides: Partial<BackupBundle['envelope']> = {}): BackupBundle => ({
  envelope: {
    format: BACKUP_FORMAT_VERSION,
    shape: 'archive',
    exportedAt: '2026-01-01T00:00:00.000Z',
    orgId: 'src-org',
    tableNames: [],
    ...overrides,
  },
  data: {},
})

describe('assertCompatible', () => {
  it('passes for a current-format bundle', () => {
    expect(() => assertCompatible(bundle())).not.toThrow()
  })

  it('rejects an unknown format', () => {
    expect(() => assertCompatible(bundle({ format: '0.9' as never }))).toThrow(/Unsupported backup format/)
  })

  it('rejects a missing envelope', () => {
    expect(() => assertCompatible({ data: {} } as unknown as BackupBundle)).toThrow(/envelope/)
  })
})

describe('remapRows', () => {
  it('remaps the org field on every row without mutating the input', () => {
    const rows = [
      { id: '1', organizationId: 'src-org', name: 'a' },
      { id: '2', organizationId: 'src-org', name: 'b' },
    ]
    const out = remapRows(rows, 'organizationId', 'dest-org')
    expect(out.map((r) => r.organizationId)).toEqual(['dest-org', 'dest-org'])
    expect(out.map((r) => r.id)).toEqual(['1', '2']) // UUIDs preserved
    expect(rows[0].organizationId).toBe('src-org') // input untouched
  })

  it('applies forced fields, overriding row values', () => {
    const out = remapRows(
      [{ id: '1', organizationId: 'src', createdBy: 'old-user' }],
      'organizationId',
      'dest',
      { createdBy: 'importer' },
    )
    expect(out[0]).toMatchObject({ organizationId: 'dest', createdBy: 'importer' })
  })

  it('honors a non-default org field name', () => {
    const out = remapRows([{ sourceOrgId: 'src' }], 'sourceOrgId', 'dest')
    expect(out[0].sourceOrgId).toBe('dest')
  })
})
