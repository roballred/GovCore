import { describe, expect, it } from 'vitest'
import { defineContentType } from './types'

const ok = { name: 'note', label: 'Note', fields: [{ name: 'title', type: 'text' as const }] }

describe('defineContentType', () => {
  it('returns a valid definition unchanged', () => {
    expect(defineContentType(ok)).toBe(ok)
  })

  it('rejects a non-snake_case type name', () => {
    expect(() => defineContentType({ ...ok, name: 'Note' })).toThrow(/snake_case/)
    expect(() => defineContentType({ ...ok, name: '1note' })).toThrow(/snake_case/)
  })

  it('requires at least one field', () => {
    expect(() => defineContentType({ name: 'note', fields: [] })).toThrow(/at least one field/)
  })

  it('rejects a non-snake_case field name', () => {
    expect(() => defineContentType({ name: 'note', fields: [{ name: 'Title', type: 'text' }] })).toThrow(
      /snake_case/,
    )
  })

  it('rejects a field colliding with a reserved engine column', () => {
    for (const name of ['id', 'organization_id', 'status', 'created_at', 'updated_at']) {
      expect(() => defineContentType({ name: 'note', fields: [{ name, type: 'text' }] })).toThrow(
        /reserved/,
      )
    }
  })

  it('rejects duplicate field names', () => {
    expect(() =>
      defineContentType({
        name: 'note',
        fields: [
          { name: 'title', type: 'text' },
          { name: 'title', type: 'textarea' },
        ],
      }),
    ).toThrow(/duplicate/)
  })

  it('rejects an unknown field type', () => {
    expect(() =>
      // @ts-expect-error — exercising the runtime guard
      defineContentType({ name: 'note', fields: [{ name: 'x', type: 'json' }] }),
    ).toThrow(/unknown type/)
  })

  it('accepts relationship field types in the vocabulary (compiler rejects them later)', () => {
    expect(() =>
      defineContentType({ name: 'cap', fields: [{ name: 'owner', type: 'reference', to: 'person' }] }),
    ).not.toThrow()
  })
})
