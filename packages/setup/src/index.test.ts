import { describe, expect, it } from 'vitest'
import { assertSafeIdentifier } from './identifier'

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
