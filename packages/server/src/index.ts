// @govcore/server — tenantAction, the enforced server-action seam.
//
// Every tenant-scoped mutation runs through here. tenantAction:
//   1. resolves the actor's active context (never trusts caller input),
//   2. applies a permission gate (if configured),
//   3. opens a transaction and sets the transaction-local org GUC, so the RLS
//      policies in @govcore/schema apply to every query in the handler, and
//   4. hands the handler an audit fn pre-bound to the actor + org.
//
// The app builds its own typed `tenantAction` once via createTenantActions,
// injecting its db, its session→context resolver, and its rbac instance.

import { eq, sql } from 'drizzle-orm'
import { organizations, isOrganizationActive, type GovcoreDb } from '@govcore/schema'
import { writeAuditLog, type AuditEvent } from '@govcore/audit'

/** The trusted, server-resolved identity of the current actor. */
export interface ActiveContext {
  userId: string
  organizationId: string
  role: string
  instanceRole?: string | null
}

/** What a handler receives: the active context plus a pre-bound audit writer. */
export interface TenantActionContext extends ActiveContext {
  /** Write an audit row in the *same* transaction, pre-filled with actor + org. */
  audit: (event: AuditEvent) => Promise<void>
}

export interface CreateTenantActionsConfig {
  db: GovcoreDb
  /** Resolve the current actor's active context — typically from the auth() session. */
  getActiveContext: () => Promise<ActiveContext | null>
  /**
   * Optional permission gate — pass an `@govcore/rbac` instance directly. Method
   * syntax (not an arrow property) so its bivariant parameters accept a
   * `createRbac<Role, Permission>()` whose `hasPermission` is typed with the
   * app's role/permission *literals*, while the active role here is a `string`.
   */
  rbac?: { hasPermission(role: string, permission: string): boolean }
  /** Called when there is no active context. Default: throws Error('Unauthorized'). */
  onUnauthorized?: () => never
  /** Called when the permission check fails. Default: throws Error('Forbidden'). */
  onForbidden?: () => never
  /**
   * Called when the active org is not `active` (suspended/archived) — the org
   * lifecycle gate. Receives the blocking status so the app can route to a
   * dedicated page. Default: throws Error(`Organization is <status>`).
   */
  onOrgInactive?: (status: string) => never
}

export type TenantActionHandler<I, O> = (
  args: { ctx: TenantActionContext; db: GovcoreDb },
  input: I,
) => Promise<O>

export interface TenantActionOptions {
  /** Permission required to run this action (checked against the active role). */
  permission?: string
}

/**
 * Build the app's typed `tenantAction`. Call once at app startup with the app's
 * db, session→context resolver, and rbac instance.
 */
export function createTenantActions(config: CreateTenantActionsConfig) {
  const { db, getActiveContext, rbac } = config

  return function tenantAction<I = void, O = unknown>(
    options: TenantActionOptions,
    handler: TenantActionHandler<I, O>,
  ): (input: I) => Promise<O> {
    return async (input: I): Promise<O> => {
      const active = await getActiveContext()
      if (!active) {
        if (config.onUnauthorized) return config.onUnauthorized()
        throw new Error('Unauthorized')
      }

      // Org lifecycle gate: a suspended/archived org runs no tenant transactions,
      // regardless of the actor's permissions. `organizations` is not RLS-bound,
      // so this reads on the runtime pool without a tenant GUC.
      const [org] = await db
        .select({ status: organizations.status })
        .from(organizations)
        .where(eq(organizations.id, active.organizationId))
        .limit(1)
      if (org && !isOrganizationActive(org.status)) {
        if (config.onOrgInactive) return config.onOrgInactive(org.status)
        throw new Error(`Organization is ${org.status}`)
      }

      if (options.permission) {
        const allowed = rbac?.hasPermission(active.role, options.permission) ?? false
        if (!allowed) {
          if (config.onForbidden) return config.onForbidden()
          throw new Error('Forbidden')
        }
      }

      return db.transaction(async (tx) => {
        // Transaction-local org GUC → RLS policies bind to every query below.
        await tx.execute(sql`select set_config('app.current_org', ${active.organizationId}, true)`)
        const txDb = tx as unknown as GovcoreDb
        const ctx: TenantActionContext = {
          ...active,
          audit: (event) =>
            writeAuditLog(txDb, {
              ...event,
              userId: event.userId ?? active.userId,
              organizationId: event.organizationId ?? active.organizationId,
            }),
        }
        return handler({ ctx, db: txDb }, input)
      })
    }
  }
}

export {
  createOperatorActions,
  INSTANCE_ADMIN_ROLE,
  type OperatorContext,
  type CreateOperatorActionsConfig,
  type OperatorActionHandler,
} from './operator'
