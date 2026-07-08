import { describe, expect, it } from 'vitest'
import { isUniqueViolation, isOrganizationActive, ORGANIZATION_STATUSES } from './index'

describe('isOrganizationActive', () => {
  it('is true only for the active status', () => {
    expect(isOrganizationActive('active')).toBe(true)
    expect(isOrganizationActive('suspended')).toBe(false)
    expect(isOrganizationActive('archived')).toBe(false)
  })

  it('treats missing status as not active', () => {
    expect(isOrganizationActive(null)).toBe(false)
    expect(isOrganizationActive(undefined)).toBe(false)
    expect(isOrganizationActive('')).toBe(false)
  })

  it('enumerates the three lifecycle states', () => {
    expect([...ORGANIZATION_STATUSES]).toEqual(['active', 'suspended', 'archived'])
  })
})

describe('isUniqueViolation', () => {
  it('detects a raw driver unique violation', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true)
  })

  it('detects a Drizzle-wrapped violation (code on .cause)', () => {
    // The shape that actually reaches an operator flow: DrizzleQueryError with
    // its own code undefined and the postgres-js error on `cause`.
    const wrapped = { name: 'DrizzleQueryError', code: undefined, cause: { code: '23505' } }
    expect(isUniqueViolation(wrapped)).toBe(true)
  })

  it('walks more than one level of cause', () => {
    expect(isUniqueViolation({ cause: { cause: { code: '23505' } } })).toBe(true)
  })

  it('is false for a different SQLSTATE (e.g. FK violation)', () => {
    expect(isUniqueViolation({ code: '23503' })).toBe(false)
    expect(isUniqueViolation({ cause: { code: '23503' } })).toBe(false)
  })

  it('is false for non-error inputs', () => {
    expect(isUniqueViolation(null)).toBe(false)
    expect(isUniqueViolation(undefined)).toBe(false)
    expect(isUniqueViolation('23505')).toBe(false)
    expect(isUniqueViolation({})).toBe(false)
  })

  it('terminates on a self-referential cause chain', () => {
    const cyclic: { code?: string; cause?: unknown } = { code: 'x' }
    cyclic.cause = cyclic
    expect(isUniqueViolation(cyclic)).toBe(false)
  })
})
