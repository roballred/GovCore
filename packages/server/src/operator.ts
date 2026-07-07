// @govcore/server — operatorAction, the operator-plane counterpart to tenantAction.
//
// The instance console legitimately crosses org boundaries: list every org,
// provision a user in any org, read the platform audit. Those queries must NOT
// run through the tenant seam — there is no single active org, and the runtime
// pool's FORCE-RLS (keyed on the `app.current_org` GUC) would filter them to
// nothing. So the operator plane is the mirror image of tenantAction:
//
//   tenantAction   — runtime pool · sets the org GUC · gated by an RBAC permission
//   operatorAction — privileged pool · NO org GUC (cross-org) · gated by instanceRole
//
// The privileged `operatorDb` is the same RLS-bypassing pool createAuth takes as
// `authDb`. Wrapping every cross-org mutation in operatorAction is what turns a
// consumer's ad-hoc `platformDb.select(...)` into a named, instance-admin-gated
// seam — so the gate can't be forgotten and the plane has one definition.

import { type GovcoreDb } from '@govcore/schema'
import { writeAuditLog, type AuditEvent } from '@govcore/audit'
import type { ActiveContext } from './index'

/** The default `instanceRole` value that grants operator-plane access. */
export const INSTANCE_ADMIN_ROLE = 'instance_admin'

/** What an operator handler receives: the actor plus a pre-bound audit writer. */
export interface OperatorContext {
  userId: string
  instanceRole: string
  /** Write a platform audit row, pre-filled with the operator as actor. */
  audit: (event: AuditEvent) => Promise<void>
}

export interface CreateOperatorActionsConfig {
  /**
   * The privileged, RLS-bypassing pool (the same one createAuth takes as
   * `authDb`). Operator queries run here because they are cross-org and must
   * not be filtered by the tenant GUC.
   */
  operatorDb: GovcoreDb
  /** Resolve the current actor's active context — typically from the auth() session. */
  getActiveContext: () => Promise<ActiveContext | null>
  /** The `instanceRole` that grants operator access. Default `instance_admin`. */
  operatorRole?: string
  /** Called when there is no active context. Default: throws Error('Unauthorized'). */
  onUnauthorized?: () => never
  /** Called when the actor is not an operator. Default: throws Error('Forbidden'). */
  onForbidden?: () => never
}

export type OperatorActionHandler<I, O> = (
  args: { ctx: OperatorContext; db: GovcoreDb },
  input: I,
) => Promise<O>

/**
 * Build the app's typed `operatorAction`. Call once at app startup with the
 * privileged pool and the session→context resolver.
 *
 * The handler receives the raw `operatorDb` (not a pre-opened transaction):
 * cross-org operator mutations — e.g. `@govcore/tenancy`'s `createOrganization`
 * / `updateUserAdministration` — open and audit their own transactions, so a
 * forced outer transaction would only nest. Deliberately sets no org GUC.
 */
export function createOperatorActions(config: CreateOperatorActionsConfig) {
  const { operatorDb, getActiveContext } = config
  const operatorRole = config.operatorRole ?? INSTANCE_ADMIN_ROLE

  return function operatorAction<I = void, O = unknown>(
    handler: OperatorActionHandler<I, O>,
  ): (input: I) => Promise<O> {
    return async (input: I): Promise<O> => {
      const active = await getActiveContext()
      if (!active) {
        if (config.onUnauthorized) return config.onUnauthorized()
        throw new Error('Unauthorized')
      }
      if (active.instanceRole !== operatorRole) {
        if (config.onForbidden) return config.onForbidden()
        throw new Error('Forbidden')
      }

      const ctx: OperatorContext = {
        userId: active.userId,
        instanceRole: active.instanceRole,
        audit: (event) =>
          writeAuditLog(operatorDb, { ...event, userId: event.userId ?? active.userId }),
      }
      return handler({ ctx, db: operatorDb }, input)
    }
  }
}
