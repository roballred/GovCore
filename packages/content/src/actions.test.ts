import { describe, expect, it } from 'vitest'
import { defineContentType } from './types'
import { generateContentActions, type TenantAction } from './actions'

// A fake tenantAction that records the options each action was built with and
// returns a stub — lets us assert the generated set + permission wiring without a db.
function recordingTenantAction() {
  const built: Array<{ permission?: string }> = []
  const tenantAction: TenantAction = (options, _handler) => {
    built.push({ permission: options.permission })
    return (async () => ({}) as never) as never
  }
  return { tenantAction, built }
}

const note = defineContentType({ name: 'note', fields: [{ name: 'title', type: 'text', required: true }] })
const table = {} as Parameters<typeof generateContentActions>[2]

describe('generateContentActions', () => {
  it('returns the full CRUD + lifecycle action set', () => {
    const { tenantAction } = recordingTenantAction()
    const actions = generateContentActions(tenantAction, note, table)
    expect(Object.keys(actions).sort()).toEqual(
      ['archive', 'create', 'get', 'list', 'listPage', 'publish', 'remove', 'update'].sort(),
    )
    for (const fn of Object.values(actions)) expect(typeof fn).toBe('function')
  })

  it('wires the configured permissions onto the mutating actions', () => {
    const { tenantAction, built } = recordingTenantAction()
    generateContentActions(tenantAction, note, table, {
      permissions: { create: 'note:create', update: 'note:update', remove: 'note:delete', publish: 'note:publish' },
    })
    const perms = built.map((b) => b.permission)
    expect(perms).toContain('note:create')
    expect(perms).toContain('note:update')
    expect(perms).toContain('note:delete')
    expect(perms).toContain('note:publish')
    // reads carry no permission
    expect(perms.filter((p) => p === undefined).length).toBeGreaterThanOrEqual(2)
  })
})
