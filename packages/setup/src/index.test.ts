import { describe, expect, it } from 'vitest'
import { assertSafeIdentifier } from './identifier'
import {
  PLATFORM_SCHEMA,
  RUNTIME_AUDIT_TABLE,
  RUNTIME_DML_TABLES,
  RUNTIME_REVOKED_TABLES,
  RUNTIME_SELECT_TABLES,
  buildRuntimeGrantStatements,
} from './runtime-grants'

describe('assertSafeIdentifier', () => {
  it('accepts ordinary role/schema identifiers', () => {
    for (const ok of ['govcore', 'govcrm_app', 'content', '_private', 'Role1']) {
      expect(() => assertSafeIdentifier(ok, 'role')).not.toThrow()
    }
  })

  it('rejects identifiers that could break out of the DDL', () => {
    for (const bad of ['govcore; DROP ROLE postgres', 'a b', 'app-role', '1role', '', 'role"x', "x'y"]) {
      expect(() => assertSafeIdentifier(bad, 'role')).toThrow(/Unsafe role identifier/)
    }
  })

  it('names the kind in the error', () => {
    expect(() => assertSafeIdentifier('bad name', 'schema')).toThrow(/Unsafe schema identifier/)
  })
})

describe('buildRuntimeGrantStatements (#152)', () => {
  const role = 'govcore_app'
  const { revoke, grant, otherSchema } = buildRuntimeGrantStatements(role)
  const all = [...revoke, ...grant].join('\n')

  it('revokes blanket ALL-TABLES grants before applying the matrix', () => {
    expect(revoke.some((s) => s.includes(`ALL TABLES IN SCHEMA ${PLATFORM_SCHEMA}`))).toBe(true)
    expect(revoke.some((s) => s.includes('ALTER DEFAULT PRIVILEGES') && s.includes('REVOKE'))).toBe(true)
  })

  it('grants SELECT-only on organizations', () => {
    expect(all).toMatch(/GRANT SELECT ON govcore\.organizations TO govcore_app/)
    expect(all).not.toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON[^;]*organizations/)
  })

  it('grants full DML on RLS-bound tables', () => {
    for (const t of RUNTIME_DML_TABLES) {
      expect(all).toContain(`govcore.${t}`)
    }
    expect(grant.some((s) => s.startsWith('GRANT SELECT, INSERT, UPDATE, DELETE ON'))).toBe(true)
  })

  it('grants SELECT, INSERT only on audit_log', () => {
    expect(all).toMatch(new RegExp(`GRANT SELECT, INSERT ON govcore\\.${RUNTIME_AUDIT_TABLE}`))
  })

  it('never grants the revoked (auth/support/operator) tables', () => {
    for (const t of RUNTIME_REVOKED_TABLES) {
      expect(all).not.toMatch(new RegExp(`GRANT[^;]*govcore\\.${t}`))
    }
  })

  it('keeps full DML + default privileges for non-platform schemas (content)', () => {
    const content = otherSchema('content').join('\n')
    expect(content).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA content')
    expect(content).toContain('ALTER DEFAULT PRIVILEGES IN SCHEMA content GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES')
  })

  it('select + dml + revoked lists do not overlap', () => {
    const select = new Set<string>(RUNTIME_SELECT_TABLES)
    const dml = new Set<string>([...RUNTIME_DML_TABLES, RUNTIME_AUDIT_TABLE])
    const revoked = new Set<string>(RUNTIME_REVOKED_TABLES)
    for (const t of select) {
      expect(dml.has(t)).toBe(false)
      expect(revoked.has(t)).toBe(false)
    }
    for (const t of dml) expect(revoked.has(t)).toBe(false)
  })
})
