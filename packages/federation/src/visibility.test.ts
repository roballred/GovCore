import { describe, expect, it } from 'vitest'
import { assertOwnership, parseListScope } from './visibility'

describe('parseListScope', () => {
  it('returns "federated" only for the exact opt-in value', () => {
    expect(parseListScope('federated')).toBe('federated')
  })

  it('defaults to "org" for anything else', () => {
    expect(parseListScope('org')).toBe('org')
    expect(parseListScope(undefined)).toBe('org')
    expect(parseListScope('')).toBe('org')
    expect(parseListScope('FEDERATED')).toBe('org')
    expect(parseListScope(['federated'])).toBe('org') // array form is not the opt-in
  })
})

describe('assertOwnership', () => {
  it('passes when the entity org matches the caller', () => {
    expect(() => assertOwnership('org-1', 'org-1')).not.toThrow()
  })

  it('throws on a mismatched org', () => {
    expect(() => assertOwnership('org-2', 'org-1')).toThrow(/another organization/)
  })

  it('throws on a missing entity org', () => {
    expect(() => assertOwnership(null, 'org-1')).toThrow(/another organization/)
    expect(() => assertOwnership(undefined, 'org-1')).toThrow(/another organization/)
  })
})
