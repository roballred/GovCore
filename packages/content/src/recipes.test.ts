import { describe, expect, it } from 'vitest'
import { flattenTaxonomy, isNodeRef, resolveRowRefs } from './recipes'

describe('flattenTaxonomy', () => {
  it('flattens nested nodes into install order with parent slugs (parents first)', () => {
    const flat = flattenTaxonomy([
      {
        slug: 'business',
        label: 'Business',
        children: [
          { slug: 'capabilities', label: 'Capabilities' },
          { slug: 'processes', label: 'Processes', children: [{ slug: 'core', label: 'Core' }] },
        ],
      },
      { slug: 'application', label: 'Application' },
    ])
    expect(flat.map((n) => n.slug)).toEqual(['business', 'capabilities', 'processes', 'core', 'application'])
    expect(flat.find((n) => n.slug === 'capabilities')!.parentSlug).toBe('business')
    expect(flat.find((n) => n.slug === 'core')!.parentSlug).toBe('processes')
    expect(flat.find((n) => n.slug === 'business')!.parentSlug).toBeNull()
    // a parent always precedes its child
    const idx = (s: string) => flat.findIndex((n) => n.slug === s)
    expect(idx('processes')).toBeLessThan(idx('core'))
  })
})

describe('isNodeRef', () => {
  it('recognizes a { $node } sentinel', () => {
    expect(isNodeRef({ $node: { tree: 't', slug: 's' } })).toBe(true)
    expect(isNodeRef('plain')).toBe(false)
    expect(isNodeRef(null)).toBe(false)
    expect(isNodeRef({ name: 'x' })).toBe(false)
  })
})

describe('resolveRowRefs', () => {
  const nodeIds = { 'architecture-domains': { capabilities: 'node-123' } }

  it('replaces a { $node } value with the installed node id, passing other values through', () => {
    const row = resolveRowRefs(
      { name: 'Payments', domain_node_id: { $node: { tree: 'architecture-domains', slug: 'capabilities' } } },
      nodeIds,
    )
    expect(row).toEqual({ name: 'Payments', domain_node_id: 'node-123' })
  })

  it('throws when a referenced node is not installed by the recipe', () => {
    expect(() =>
      resolveRowRefs({ d: { $node: { tree: 'architecture-domains', slug: 'missing' } } }, nodeIds, 'togaf'),
    ).toThrow(/togaf.*does not install/)
  })
})
