import { describe, expect, it } from 'vitest'
import { ACT_AS_COOKIE, clampActAsExpiry } from './act-as'

describe('clampActAsExpiry', () => {
  const now = new Date('2026-01-01T00:00:00.000Z')

  it('uses the requested window when it fits inside the parent lifetime', () => {
    const parentExpiresAt = new Date(now.getTime() + 60 * 60_000) // +60m
    const got = clampActAsExpiry({ ttlMinutes: 30, parentExpiresAt, now })
    expect(got.getTime()).toBe(now.getTime() + 30 * 60_000)
  })

  it('clamps to the parent expiry when the requested window would outlive it', () => {
    const parentExpiresAt = new Date(now.getTime() + 10 * 60_000) // +10m
    const got = clampActAsExpiry({ ttlMinutes: 30, parentExpiresAt, now })
    expect(got).toEqual(parentExpiresAt)
  })

  it('never outlives the parent even at equal boundaries', () => {
    const parentExpiresAt = new Date(now.getTime() + 30 * 60_000)
    const got = clampActAsExpiry({ ttlMinutes: 30, parentExpiresAt, now })
    expect(got.getTime()).toBeLessThanOrEqual(parentExpiresAt.getTime())
  })
})

describe('ACT_AS_COOKIE', () => {
  it('is the namespaced cookie name', () => {
    expect(ACT_AS_COOKIE).toBe('govcore_act_as')
  })
})
