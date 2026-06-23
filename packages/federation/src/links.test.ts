import { describe, expect, it } from 'vitest'
import { resolveLinkRequest } from './links'

describe('resolveLinkRequest', () => {
  it('creates when no link exists for the pair', () => {
    expect(resolveLinkRequest(null)).toBe('create')
    expect(resolveLinkRequest(undefined)).toBe('create')
  })

  it('blocks when a pending or active link already exists', () => {
    expect(resolveLinkRequest({ status: 'pending' })).toBe('block')
    expect(resolveLinkRequest({ status: 'active' })).toBe('block')
  })

  it('reactivates a previously rejected link', () => {
    expect(resolveLinkRequest({ status: 'rejected' })).toBe('reactivate')
  })
})
