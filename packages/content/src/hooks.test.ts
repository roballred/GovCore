import { describe, expect, it } from 'vitest'
import { defineContentType } from './types'
import { assertTransition } from './hooks'

const doc = defineContentType({ name: 'doc', fields: [{ name: 'title', type: 'text' }] })

describe('assertTransition', () => {
  it('permits legal lifecycle moves', () => {
    expect(() => assertTransition(doc, 'draft', 'published')).not.toThrow()
    expect(() => assertTransition(doc, 'published', 'archived')).not.toThrow()
    expect(() => assertTransition(doc, 'published', 'draft')).not.toThrow()
  })

  it('rejects illegal moves with the type name in the message', () => {
    expect(() => assertTransition(doc, 'draft', 'archived')).toThrow(/illegal transition draft → archived for "doc"/)
    expect(() => assertTransition(doc, 'archived', 'published')).toThrow(/illegal transition/)
  })
})
