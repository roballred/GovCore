// @govea/core/rbac — GovEA's RBAC instance, built on the generic
// `@govcore/rbac` factory. The reusable machinery (createRbac) lives in
// @govcore/rbac; GovEA's specific roles/permissions live here. App-level
// helpers in `apps/govea/src/lib/rbac.ts` stay thin wrappers around what this
// module exports.
//
// (Legacy: @govea/core is inherited from the GovEA seed. This is the worked
// example of @govcore/rbac for GovCore's first consumer; a fresh consumer
// declares its own map via createRbac. Closes #34 — single source of truth.)

import { createRbac } from '@govcore/rbac'

export type Role = 'admin' | 'contributor' | 'viewer'

export type Permission =
  | 'content:read'
  | 'content:create'
  | 'content:edit'
  | 'content:delete'
  | 'content:publish'
  | 'users:manage'
  | 'settings:manage'

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'content:read',
    'content:create',
    'content:edit',
    'content:delete',
    'content:publish',
    'users:manage',
    'settings:manage',
  ],
  contributor: ['content:read', 'content:create', 'content:edit', 'content:publish'],
  viewer: ['content:read'],
}

// Ordering: admin > contributor > viewer.
export const ROLE_HIERARCHY: Record<Role, number> = {
  admin: 3,
  contributor: 2,
  viewer: 1,
}

/** GovEA's RBAC instance — the worked example of `@govcore/rbac`'s createRbac. */
export const goveaRbac = createRbac<Role, Permission>({
  rolePermissions: ROLE_PERMISSIONS,
  hierarchy: ROLE_HIERARCHY,
})

export function hasPermission(role: Role, permission: Permission): boolean {
  return goveaRbac.hasPermission(role, permission)
}

// `roleAtLeast(actual, minimum)` is true when `actual` is at or above
// `minimum` in the hierarchy.
export function roleAtLeast(role: Role, minimum: Role): boolean {
  return goveaRbac.roleAtLeast(role, minimum)
}

export function roleIsAdmin(role: Role): boolean {
  return role === 'admin'
}

export function roleCanEdit(role: Role): boolean {
  return roleAtLeast(role, 'contributor')
}
