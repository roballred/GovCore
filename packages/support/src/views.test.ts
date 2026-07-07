import { describe, expect, it } from 'vitest'
import { actAsStatus, breakGlassStatus } from './views'

const now = new Date('2026-01-01T12:00:00.000Z')
const future = new Date('2026-01-01T13:00:00.000Z')
const past = new Date('2026-01-01T11:00:00.000Z')

describe('breakGlassStatus', () => {
  const base = { revokedAt: null, expiresAt: future, requiresApproval: false, approvedAt: null }

  it('is active when live, no approval required', () => {
    expect(breakGlassStatus(base, now)).toBe('active')
  })

  it('is active once an approval-required session is approved', () => {
    expect(breakGlassStatus({ ...base, requiresApproval: true, approvedAt: past }, now)).toBe('active')
  })

  it('is pending while approval-required and not yet approved', () => {
    expect(breakGlassStatus({ ...base, requiresApproval: true }, now)).toBe('pending')
  })

  it('is revoked regardless of the clock', () => {
    expect(breakGlassStatus({ ...base, revokedAt: past }, now)).toBe('revoked')
  })

  it('is expired past its window', () => {
    expect(breakGlassStatus({ ...base, expiresAt: past }, now)).toBe('expired')
  })

  it('expiry wins over a pending approval', () => {
    // A grant that lapsed before it was ever approved is expired, not pending.
    expect(breakGlassStatus({ ...base, requiresApproval: true, expiresAt: past }, now)).toBe('expired')
  })

  it('revocation wins over expiry', () => {
    expect(breakGlassStatus({ ...base, revokedAt: past, expiresAt: past }, now)).toBe('revoked')
  })
})

describe('actAsStatus', () => {
  it('is active while live', () => {
    expect(actAsStatus({ endedAt: null, expiresAt: future }, now)).toBe('active')
  })

  it('is expired past its window', () => {
    expect(actAsStatus({ endedAt: null, expiresAt: past }, now)).toBe('expired')
  })

  it('is ended when explicitly ended, even before expiry', () => {
    expect(actAsStatus({ endedAt: past, expiresAt: future }, now)).toBe('ended')
  })
})
