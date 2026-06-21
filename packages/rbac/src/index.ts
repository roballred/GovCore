// @govcore/rbac — generic, dependency-free role/permission machinery.
//
// Edge-safe: pure types and functions, no DB or Node imports, so it can be
// imported into Next middleware. An app supplies its own role/permission
// string unions; GovCore never ships a fixed role set. See design §13.3.

/**
 * The two source-of-truth inputs an app supplies: which permissions each role
 * holds, and a role→rank hierarchy (higher number = more authority).
 */
export interface RbacDefinition<R extends string, P extends string> {
  rolePermissions: Record<R, readonly P[]>
  hierarchy: Record<R, number>
}

/** A typed RBAC instance produced by {@link createRbac}. */
export interface Rbac<R extends string, P extends string> {
  /** All roles, ordered most- to least-privileged. */
  readonly roles: readonly R[]
  readonly rolePermissions: Record<R, readonly P[]>
  readonly hierarchy: Record<R, number>
  /** True when `role` holds `permission`. */
  hasPermission(role: R, permission: P): boolean
  /** The permissions held by `role`. */
  permissionsFor(role: R): readonly P[]
  /** True when `role` is at or above `minimum` in the hierarchy. */
  roleAtLeast(role: R, minimum: R): boolean
  /** The highest-ranked role in the hierarchy. */
  topRole(): R
}

/**
 * Build a typed RBAC instance from an app-supplied role/permission map.
 *
 * Generic over the app's own role (`R`) and permission (`P`) string unions, so
 * a consumer is never tied to another app's roles. This is the reusable
 * machinery; an app declares its roles once and passes them here.
 *
 * @example
 * const rbac = createRbac({
 *   rolePermissions: { admin: ['read', 'write'], viewer: ['read'] },
 *   hierarchy: { admin: 2, viewer: 1 },
 * })
 * rbac.hasPermission('viewer', 'write') // false
 */
export function createRbac<R extends string, P extends string>(
  def: RbacDefinition<R, P>,
): Rbac<R, P> {
  const roles = (Object.keys(def.rolePermissions) as R[]).sort(
    (a, b) => def.hierarchy[b] - def.hierarchy[a],
  )

  const hasPermission = (role: R, permission: P): boolean =>
    def.rolePermissions[role]?.includes(permission) ?? false

  const permissionsFor = (role: R): readonly P[] => def.rolePermissions[role] ?? []

  const roleAtLeast = (role: R, minimum: R): boolean =>
    def.hierarchy[role] >= def.hierarchy[minimum]

  const topRole = (): R => roles[0]

  return {
    roles,
    rolePermissions: def.rolePermissions,
    hierarchy: def.hierarchy,
    hasPermission,
    permissionsFor,
    roleAtLeast,
    topRole,
  }
}
