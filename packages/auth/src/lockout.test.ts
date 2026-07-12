import { describe, it, expect } from 'vitest'
import { computeLockout } from './lockout'

describe('computeLockout (#107 account lockout)', () => {
  const policy = { lockoutThreshold: 3, lockoutDurationMinutes: 15 }
  const now = 1_000_000_000_000

  it('increments the failure count without locking below the threshold', () => {
    expect(computeLockout(0, policy, now)).toEqual({ failedLoginAttempts: 1, lockoutUntil: null })
    expect(computeLockout(1, policy, now)).toEqual({ failedLoginAttempts: 2, lockoutUntil: null })
  })

  it('locks exactly when the count reaches the threshold', () => {
    const r = computeLockout(2, policy, now) // -> 3, which is >= threshold
    expect(r.failedLoginAttempts).toBe(3)
    expect(r.lockoutUntil).toEqual(new Date(now + 15 * 60_000))
  })

  it('stays locked (and keeps counting) past the threshold', () => {
    const r = computeLockout(5, policy, now)
    expect(r.failedLoginAttempts).toBe(6)
    expect(r.lockoutUntil).toEqual(new Date(now + 15 * 60_000))
  })

  it('never locks when the threshold is 0 (per-org opt-out)', () => {
    const off = { lockoutThreshold: 0, lockoutDurationMinutes: 15 }
    expect(computeLockout(99, off, now)).toEqual({ failedLoginAttempts: 100, lockoutUntil: null })
  })
})
