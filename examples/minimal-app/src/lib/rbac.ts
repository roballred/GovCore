import { createRbac } from '@govcore/rbac'

// This app's role/permission vocabulary — supplied to GovCore, not baked in.
export const rbac = createRbac({
  rolePermissions: {
    admin: ['content:read', 'content:write', 'users:manage'],
    member: ['content:read', 'content:write'],
    viewer: ['content:read'],
  },
  hierarchy: { admin: 3, member: 2, viewer: 1 },
})
