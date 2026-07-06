import { describe, expect, it } from 'vitest'
import { isUniqueViolation } from './index'

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
