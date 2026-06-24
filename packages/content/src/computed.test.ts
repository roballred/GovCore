import { describe, expect, it } from 'vitest'
import { defineContentType } from './types'
import { computeFields, materializedValues, withComputed } from './computed'

// completeness = fraction of the two optional fields that are filled.
const doc = defineContentType({
  name: 'doc',
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'summary', type: 'textarea' },
    { name: 'body', type: 'textarea' },
  ],
  computed: [
    {
      name: 'completeness',
      type: 'number',
      materialized: true,
      compute: (row) => [row.summary, row.body].filter(Boolean).length / 2,
    },
    {
      name: 'has_body',
      type: 'boolean',
      compute: (row) => Boolean(row.body),
    },
  ],
})

describe('computeFields / withComputed', () => {
  it('computes every declared derived value from the row', () => {
    const row = { title: 'A', summary: 'x', body: null }
    expect(computeFields(doc, row)).toEqual({ completeness: 0.5, has_body: false })
  })

  it('augments the row on read without mutating it', () => {
    const row = { title: 'A', summary: 'x', body: 'y' }
    const out = withComputed(doc, row)
    expect(out).toMatchObject({ title: 'A', completeness: 1, has_body: true })
    expect(row).toEqual({ title: 'A', summary: 'x', body: 'y' }) // untouched
  })
})

describe('materializedValues', () => {
  it('selects only the materialized computed fields', () => {
    const vals = materializedValues(doc, { title: 'A', summary: 'x', body: 'y' })
    expect(vals).toEqual({ completeness: 1 }) // has_body is on-read only
  })

  it('is empty for a type with no materialized computed fields', () => {
    const t = defineContentType({
      name: 't',
      fields: [{ name: 'n', type: 'text' }],
      computed: [{ name: 'len', type: 'number', compute: (r) => String(r.n ?? '').length }],
    })
    expect(materializedValues(t, { n: 'abc' })).toEqual({})
  })
})

describe('defineContentType — computed validation', () => {
  const base = { name: 'd', fields: [{ name: 'title', type: 'text' as const }] }

  it('rejects a computed name colliding with a stored column', () => {
    expect(() =>
      defineContentType({ ...base, computed: [{ name: 'title', type: 'text', compute: () => '' }] }),
    ).toThrow(/collides with an existing column/)
  })

  it('rejects a computed name colliding with a reference column', () => {
    expect(() =>
      defineContentType({
        name: 'd',
        fields: [{ name: 'owner', type: 'reference', to: 'person' }],
        computed: [{ name: 'owner_id', type: 'text', compute: () => '' }],
      }),
    ).toThrow(/collides with an existing column/)
  })

  it('rejects a non-snake_case computed name', () => {
    expect(() =>
      defineContentType({ ...base, computed: [{ name: 'Score', type: 'number', compute: () => 0 }] }),
    ).toThrow(/snake_case/)
  })
})
