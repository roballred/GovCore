import { describe, expect, it } from 'vitest'
import { assertSafeIdentifier } from './identifier'
import { runRoleProvisioning, type ProvisionSql } from './index'

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

// Records what a fake postgres.js client is asked to run: bound-parameter values
// (from tagged-template calls) vs. raw text passed to `.unsafe(...)`.
function stubSql() {
  const bound: unknown[] = []
  const unsafe: string[] = []
  const sql = Object.assign(
    async (_parts: TemplateStringsArray, ...values: unknown[]) => {
      bound.push(...values)
      return []
    },
    {
      unsafe: async (query: string) => {
        unsafe.push(query)
        return []
      },
    },
  ) as unknown as ProvisionSql
  return { sql, bound, unsafe }
}

describe('runRoleProvisioning — password cannot break out of the DDL (#157)', () => {
  // `$$` would have terminated the old `DO $$ … $$` block; `'` and `\` defeat
  // naive quote-doubling. All three must be inert now.
  const HOSTILE = "a$$b'c\\d$do$e"

  it('delivers the password only as a bound parameter, never in SQL text', async () => {
    const { sql, bound, unsafe } = stubSql()
    await runRoleProvisioning(sql, { role: 'govcore_app', password: HOSTILE, schemas: ['govcore'], log: () => {} })

    expect(bound).toContain(HOSTILE) // bound into set_config, not concatenated
    for (const text of unsafe) {
      expect(text).not.toContain(HOSTILE) // never appears in any DDL string
      expect(text).not.toContain('$$b') // so a stray `$$` can't close the block
    }
  })

  it('creates the role via current_setting + format(%L), not an inline literal', async () => {
    const { sql, unsafe } = stubSql()
    await runRoleProvisioning(sql, { role: 'govcore_app', password: HOSTILE, schemas: [], log: () => {} })

    const doBlock = unsafe.find((t) => t.includes('CREATE ROLE'))
    expect(doBlock).toBeDefined()
    expect(doBlock).toContain("current_setting('govcore.provision_password')")
    expect(doBlock).toContain("format('CREATE ROLE %I LOGIN PASSWORD %L'")
    expect(doBlock).not.toContain("PASSWORD '") // no inline password literal
    expect(doBlock).toContain("rolname = 'govcore_app'") // idempotent, validated identifier
  })

  it('clears the password GUC after provisioning', async () => {
    const { sql, bound } = stubSql()
    await runRoleProvisioning(sql, { role: 'govcore_app', password: HOSTILE, schemas: [], log: () => {} })

    // set_config is called again with '' to wipe the plaintext from session state.
    expect(bound.filter((v) => v === '')).toHaveLength(1)
  })

  it('re-validates the role identifier (defense in depth for direct callers)', async () => {
    const { sql } = stubSql()
    await expect(
      runRoleProvisioning(sql, {
        role: 'app; DROP ROLE postgres',
        password: 'x',
        schemas: [],
        log: () => {},
      }),
    ).rejects.toThrow(/Unsafe role identifier/)
  })
})
