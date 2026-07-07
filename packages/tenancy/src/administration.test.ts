import { describe, expect, it } from 'vitest'
import { slugify } from './administration'

describe('slugify', () => {
  it('lowercases and hyphenates a display name', () => {
    expect(slugify('Town of Cedar Falls')).toBe('town-of-cedar-falls')
  })

  it('collapses runs of non-alphanumerics into a single hyphen', () => {
    expect(slugify('Acme,   Inc. — West')).toBe('acme-inc-west')
  })

  it('trims leading and trailing separators', () => {
    expect(slugify('  !Hello!  ')).toBe('hello')
    expect(slugify('---edge---')).toBe('edge')
  })

  it('keeps digits', () => {
    expect(slugify('District 9 Utilities')).toBe('district-9-utilities')
  })

  it('returns empty string when nothing survives', () => {
    expect(slugify('!!!')).toBe('')
  })
})
