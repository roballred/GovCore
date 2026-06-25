import { describe, expect, it } from 'vitest'
import { createTenantActions, type CreateTenantActionsConfig } from './index'

// Regression guard for #45: a permission gate whose `hasPermission` is typed with
// the app's role/permission *literals* (the shape `createRbac<Role, Permission>()`
// returns) must satisfy `CreateTenantActionsConfig.rbac`, whose params are wide
// `string`s. This compiles only because the config uses method syntax (bivariant
// params). If someone reverts it to an arrow property, this file stops compiling.
type Role = 'admin' | 'viewer'
type Permission = 'content:read' | 'content:write'

const literalRbac = {
  hasPermission(role: Role, permission: Permission): boolean {
    return role === 'admin' || permission === 'content:read'
  },
}

describe('CreateTenantActionsConfig.rbac', () => {
  it('accepts a literal-typed (createRbac-shaped) permission gate without casting', () => {
    const config: CreateTenantActionsConfig = {
      db: {} as CreateTenantActionsConfig['db'],
      getActiveContext: async () => null,
      rbac: literalRbac, // no cast — the whole point of #45
    }
    const tenantAction = createTenantActions(config)
    expect(typeof tenantAction).toBe('function')
  })
})
