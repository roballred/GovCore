import { describe, expect, it } from 'vitest'
import {
  BREAK_GLASS_APPROVAL_THRESHOLD_MINUTES,
  BREAK_GLASS_TTL_PRESETS,
  assertApprovable,
  computeBreakGlassGrant,
  isValidBreakGlassTtl,
} from './break-glass'

describe('isValidBreakGlassTtl', () => {
  it('accepts only the presets', () => {
    for (const t of BREAK_GLASS_TTL_PRESETS) expect(isValidBreakGlassTtl(t)).toBe(true)
    expect(isValidBreakGlassTtl(30)).toBe(false)
    expect(isValidBreakGlassTtl(61)).toBe(false)
    expect(isValidBreakGlassTtl(0)).toBe(false)
  })
})

describe('computeBreakGlassGrant', () => {
  const grantedAt = new Date('2026-01-01T00:00:00.000Z')

  it('requires approval only above the threshold', () => {
    expect(computeBreakGlassGrant({ ttlMinutes: 60, grantedAt }).requiresApproval).toBe(false)
    expect(computeBreakGlassGrant({ ttlMinutes: 240, grantedAt }).requiresApproval).toBe(true)
    expect(computeBreakGlassGrant({ ttlMinutes: 480, grantedAt }).requiresApproval).toBe(true)
    // boundary is strict (>) — exactly the threshold does not require approval
    expect(
      computeBreakGlassGrant({ ttlMinutes: BREAK_GLASS_APPROVAL_THRESHOLD_MINUTES, grantedAt })
        .requiresApproval,
    ).toBe(false)
  })

  it('counts TTL from grant time', () => {
    const { expiresAt } = computeBreakGlassGrant({ ttlMinutes: 240, grantedAt })
    expect(expiresAt.getTime()).toBe(grantedAt.getTime() + 240 * 60_000)
  })
})

describe('assertApprovable', () => {
  const base = {
    instanceAdminId: 'granter',
    requiresApproval: true as boolean,
    approvedAt: null as Date | null,
    revokedAt: null as Date | null,
    expiresAt: new Date('2026-01-01T01:00:00.000Z'),
  }
  const now = new Date('2026-01-01T00:00:00.000Z')

  it('passes for a valid approver on a pending, live, approval-required session', () => {
    expect(() => assertApprovable(base, 'other-admin', now)).not.toThrow()
  })

  it('rejects self-approval', () => {
    expect(() => assertApprovable(base, 'granter', now)).toThrow(/your own/)
  })

  it('rejects when the grant does not require approval', () => {
    expect(() => assertApprovable({ ...base, requiresApproval: false }, 'other', now)).toThrow(
      /does not require approval/,
    )
  })

  it('rejects an already-approved session', () => {
    expect(() => assertApprovable({ ...base, approvedAt: now }, 'other', now)).toThrow(
      /already approved/,
    )
  })

  it('rejects a revoked session', () => {
    expect(() => assertApprovable({ ...base, revokedAt: now }, 'other', now)).toThrow(/revoked/)
  })

  it('rejects an expired session', () => {
    const expired = { ...base, expiresAt: new Date('2025-12-31T23:00:00.000Z') }
    expect(() => assertApprovable(expired, 'other', now)).toThrow(/expired/)
  })
})
