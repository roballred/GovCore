import { describe, expect, it } from 'vitest'
import { buildTree, taxonomyNodeColumn, type TaxonomyNode } from './taxonomy'

const node = (id: string, parentId: string | null, label: string, sort?: number): TaxonomyNode => ({
  id,
  tree: 'domains',
  parentId,
  label,
  slug: label.toLowerCase(),
  sort,
})

describe('taxonomyNodeColumn', () => {
  it('is the field name suffixed with _node_id', () => {
    expect(taxonomyNodeColumn('domain')).toBe('domain_node_id')
  })
})

describe('buildTree', () => {
  it('nests children under parents and returns the roots', () => {
    const roots = buildTree([
      node('biz', null, 'Business'),
      node('app', null, 'Application'),
      node('biz-cap', 'biz', 'Capabilities'),
      node('biz-proc', 'biz', 'Processes'),
    ])
    expect(roots.map((r) => r.id).sort()).toEqual(['app', 'biz'])
    const biz = roots.find((r) => r.id === 'biz')!
    expect(biz.children.map((c) => c.id).sort()).toEqual(['biz-cap', 'biz-proc'])
    expect(roots.find((r) => r.id === 'app')!.children).toEqual([])
  })

  it('orders each level by sort, then label', () => {
    const roots = buildTree([
      node('b', null, 'Bravo', 2),
      node('a', null, 'Alpha', 2),
      node('c', null, 'Charlie', 1),
    ])
    expect(roots.map((r) => r.label)).toEqual(['Charlie', 'Alpha', 'Bravo'])
  })

  it('treats a node whose parent is absent from the slice as a root', () => {
    const roots = buildTree([node('orphan', 'missing-parent', 'Orphan')])
    expect(roots.map((r) => r.id)).toEqual(['orphan'])
  })

  it('does not mutate the input rows', () => {
    const input = [node('x', null, 'X')]
    buildTree(input)
    expect(input[0]).not.toHaveProperty('children')
  })
})
