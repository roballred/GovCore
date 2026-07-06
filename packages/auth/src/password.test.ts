import { describe, expect, it } from 'vitest'
import {
  FALLBACK_MIN_LENGTH,
  PASSWORD_POLICY_METADATA_KEY,
  hashPassword,
  passwordPolicyFromMetadata,
  validatePassword,
  verifyPassword,
} from './password'

describe('validatePassword', () => {
  it('rejects empty / whitespace-only passwords', () => {
    expect(validatePassword(undefined)).toEqual({ valid: false, message: 'Password is required' })
    expect(validatePassword(null)).toEqual({ valid: false, message: 'Password is required' })
    expect(validatePassword('')).toEqual({ valid: false, message: 'Password is required' })
    expect(validatePassword('   ')).toEqual({ valid: false, message: 'Password is required' })
  })

  it('enforces the fallback minimum length when no policy is given', () => {
    const short = 'a'.repeat(FALLBACK_MIN_LENGTH - 1)
    const res = validatePassword(short)
    expect(res.valid).toBe(false)
    expect((res as { message: string }).message).toContain(`${FALLBACK_MIN_LENGTH}`)
    expect(validatePassword('a'.repeat(FALLBACK_MIN_LENGTH))).toEqual({ valid: true })
  })

  it('honors a custom minLength', () => {
    expect(validatePassword('abcdefghij', { minLength: 12 }).valid).toBe(false)
    expect(validatePassword('abcdefghijkl', { minLength: 12 }).valid).toBe(true)
  })

  it('applies each character-class requirement independently', () => {
    const base = 'abcdefghij' // long enough, lowercase only
    expect(validatePassword(base, { requireUppercase: true }).valid).toBe(false)
    expect(validatePassword('Abcdefghij', { requireUppercase: true }).valid).toBe(true)

    expect(validatePassword('ABCDEFGHIJ', { requireLowercase: true }).valid).toBe(false)
    expect(validatePassword('ABCDEFGHIj', { requireLowercase: true }).valid).toBe(true)

    expect(validatePassword(base, { requireDigit: true }).valid).toBe(false)
    expect(validatePassword('abcdefghi1', { requireDigit: true }).valid).toBe(true)

    expect(validatePassword(base, { requireSpecial: true }).valid).toBe(false)
    expect(validatePassword('abcdefghi!', { requireSpecial: true }).valid).toBe(true)
  })

  it('passes a password satisfying a full policy', () => {
    expect(
      validatePassword('Str0ng!Pass', {
        minLength: 10,
        requireUppercase: true,
        requireLowercase: true,
        requireDigit: true,
        requireSpecial: true,
      }),
    ).toEqual({ valid: true })
  })
})

describe('passwordPolicyFromMetadata', () => {
  const wrap = (policy: unknown) => ({ [PASSWORD_POLICY_METADATA_KEY]: policy })

  it('returns undefined when metadata is missing or holds no policy', () => {
    expect(passwordPolicyFromMetadata(undefined)).toBeUndefined()
    expect(passwordPolicyFromMetadata(null)).toBeUndefined()
    expect(passwordPolicyFromMetadata({})).toBeUndefined()
    expect(passwordPolicyFromMetadata({ other: 1 })).toBeUndefined()
    expect(passwordPolicyFromMetadata(wrap('not-an-object'))).toBeUndefined()
  })

  it('extracts a well-formed policy from the documented key', () => {
    const policy = passwordPolicyFromMetadata(
      wrap({ minLength: 12, requireUppercase: true, requireDigit: true }),
    )
    expect(policy).toEqual({ minLength: 12, requireUppercase: true, requireDigit: true })
  })

  it('ignores fields of the wrong type rather than trusting the bag', () => {
    const policy = passwordPolicyFromMetadata(
      wrap({ minLength: '20', requireUppercase: 'yes', requireDigit: true }),
    )
    // string minLength and string requireUppercase are dropped; only the valid boolean survives.
    expect(policy).toEqual({ requireDigit: true })
  })

  it('returns undefined when the policy object has only junk fields', () => {
    expect(passwordPolicyFromMetadata(wrap({ minLength: '20', bogus: true }))).toBeUndefined()
  })

  it('resolves round-trip through validatePassword', () => {
    const policy = passwordPolicyFromMetadata(wrap({ minLength: 12 }))
    expect(validatePassword('short1', policy).valid).toBe(false)
    expect(validatePassword('longenoughpw', policy).valid).toBe(true)
  })
})

describe('hashPassword / verifyPassword', () => {
  it('round-trips a correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery staple', 4)
    expect(hash).not.toBe('correct horse battery staple')
    expect(hash.startsWith('$2')).toBe(true) // bcrypt prefix
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true)
    expect(await verifyPassword('wrong password', hash)).toBe(false)
  })

  it('produces distinct hashes for the same input (per-hash salt)', async () => {
    const a = await hashPassword('same-input', 4)
    const b = await hashPassword('same-input', 4)
    expect(a).not.toBe(b)
    expect(await verifyPassword('same-input', a)).toBe(true)
    expect(await verifyPassword('same-input', b)).toBe(true)
  })
})
