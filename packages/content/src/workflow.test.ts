import { describe, expect, it } from 'vitest'
import { allowedTransitions, canTransition } from './workflow'

describe('workflow lifecycle', () => {
  it('allows the forward path draft → published → archived', () => {
    expect(canTransition('draft', 'published')).toBe(true)
    expect(canTransition('published', 'archived')).toBe(true)
  })

  it('allows un-publishing back to draft', () => {
    expect(canTransition('published', 'draft')).toBe(true)
  })

  it('forbids skipping and illegal moves', () => {
    expect(canTransition('draft', 'archived')).toBe(false)
    expect(canTransition('archived', 'draft')).toBe(false)
    expect(canTransition('archived', 'published')).toBe(false)
  })

  it('reports reachable states (archived is terminal)', () => {
    expect(allowedTransitions('draft')).toEqual(['published'])
    expect(allowedTransitions('published')).toEqual(['draft', 'archived'])
    expect(allowedTransitions('archived')).toEqual([])
  })
})
