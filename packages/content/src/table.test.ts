import { describe, expect, it } from 'vitest'
import { defineContentType } from './types'
import { buildContentTable, buildLinkTable } from './table'

const article = defineContentType({
  name: 'article',
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'primary_tag', type: 'reference', to: 'tag' },
    { name: 'tags', type: 'link', to: 'tag' },
  ],
})

describe('buildContentTable', () => {
  const t = buildContentTable(article) as unknown as Record<string, unknown>

  it('exposes engine columns, scalar fields, and the reference as <name>_id', () => {
    for (const k of ['id', 'organizationId', 'status', 'createdAt', 'title', 'primary_tag_id']) {
      expect(t[k]).toBeDefined()
    }
  })

  it('does not put a `link` field on the main table', () => {
    expect(t.tags).toBeUndefined()
  })
})

describe('buildLinkTable', () => {
  const j = buildLinkTable(article, 'tags') as unknown as Record<string, unknown>

  it('exposes the junction columns', () => {
    for (const k of ['sourceId', 'targetId', 'organizationId']) {
      expect(j[k]).toBeDefined()
    }
  })
})
