import { describe, expect, it } from 'vitest'
import { composeAuditMetadata } from './index'

describe('composeAuditMetadata', () => {
  it('returns undefined when nothing is provided (metadata stays null)', () => {
    expect(composeAuditMetadata()).toBeUndefined()
    expect(composeAuditMetadata(null, null)).toBeUndefined()
    expect(composeAuditMetadata({}, '')).toBeUndefined()
  })

  it('passes a request-context object through unchanged', () => {
    expect(composeAuditMetadata({ ip: '203.0.113.7', userAgent: 'Mozilla/5.0' })).toEqual({
      ip: '203.0.113.7',
      userAgent: 'Mozilla/5.0',
    })
  })

  it('folds a reason into metadata.reason', () => {
    expect(composeAuditMetadata(null, 'offboarding')).toEqual({ reason: 'offboarding' })
  })

  it('merges request context and reason together', () => {
    expect(composeAuditMetadata({ ip: '203.0.113.7' }, 'offboarding')).toEqual({
      ip: '203.0.113.7',
      reason: 'offboarding',
    })
  })

  it('trims the reason and drops it when only whitespace', () => {
    expect(composeAuditMetadata(null, '  offboarding  ')).toEqual({ reason: 'offboarding' })
    expect(composeAuditMetadata({ ip: '203.0.113.7' }, '   ')).toEqual({ ip: '203.0.113.7' })
  })

  it('lets an explicit reason key in the context be normalized by the reason arg', () => {
    // The reason arg is the canonical source, so it wins over a stray context key.
    expect(composeAuditMetadata({ reason: 'stale' }, 'current')).toEqual({ reason: 'current' })
  })
})
