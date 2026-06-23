// @govcore/federation/connections — the org-to-org connection lifecycle.
//
// A connection is a bilateral, explicit link between two orgs. The requester's
// org opens it (`pending`); only the *target* org may accept (`active`) or
// reject (`rejected`). An active connection is what `getConnectedOrgIds` and the
// federated read checks key off. Each transition is audited. App-layer auth
// (who is an admin, whose org is acting) stays in the caller.

import { and, eq, or } from 'drizzle-orm'
import { orgConnections, type GovcoreDb } from '@govcore/schema'
import { writeAuditLog } from '@govcore/audit'

export type OrgConnection = typeof orgConnections.$inferSelect

/** All connections touching `orgId`, in either direction. */
export async function getConnections(db: GovcoreDb, orgId: string): Promise<OrgConnection[]> {
  return db
    .select()
    .from(orgConnections)
    .where(or(eq(orgConnections.fromOrgId, orgId), eq(orgConnections.toOrgId, orgId)))
}

/** An existing connection between two orgs in either direction, or null. */
export async function findConnectionBetween(
  db: GovcoreDb,
  orgId: string,
  targetOrgId: string,
): Promise<OrgConnection | null> {
  const [existing] = await db
    .select()
    .from(orgConnections)
    .where(
      or(
        and(eq(orgConnections.fromOrgId, orgId), eq(orgConnections.toOrgId, targetOrgId)),
        and(eq(orgConnections.fromOrgId, targetOrgId), eq(orgConnections.toOrgId, orgId)),
      ),
    )
    .limit(1)
  return existing ?? null
}

export interface RequestConnectionParams {
  /** The org opening the connection. */
  orgId: string
  /** The org being invited. */
  targetOrgId: string
  /** The acting user (recorded as `created_by` and on the audit row). */
  actorUserId: string
}

/**
 * Open a pending connection from `orgId` to `targetOrgId`. Throws if a
 * connection already exists in either direction. Audited.
 */
export async function requestConnection(
  db: GovcoreDb,
  params: RequestConnectionParams,
): Promise<OrgConnection> {
  if (params.orgId === params.targetOrgId) {
    throw new Error('Cannot connect an organization to itself')
  }
  const existing = await findConnectionBetween(db, params.orgId, params.targetOrgId)
  if (existing) throw new Error('Connection already exists or is pending')

  const [connection] = await db
    .insert(orgConnections)
    .values({
      fromOrgId: params.orgId,
      toOrgId: params.targetOrgId,
      status: 'pending',
      createdBy: params.actorUserId,
    })
    .returning()

  await writeAuditLog(db, {
    action: 'federation.connection.request',
    entityType: 'org_connection',
    entityId: connection.id,
    userId: params.actorUserId,
    organizationId: params.orgId,
    after: { targetOrgId: params.targetOrgId },
  })
  return connection
}

/** Internal: a target-only status transition with an audit row. */
async function transitionByTarget(
  db: GovcoreDb,
  params: { connectionId: string; orgId: string; actorUserId: string },
  status: 'active' | 'rejected',
  action: string,
): Promise<OrgConnection> {
  // Only the target org (toOrgId) may accept or reject.
  const [row] = await db
    .update(orgConnections)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(orgConnections.id, params.connectionId),
        eq(orgConnections.toOrgId, params.orgId),
      ),
    )
    .returning()
  if (!row) throw new Error('Connection not found or not authorized')

  await writeAuditLog(db, {
    action,
    entityType: 'org_connection',
    entityId: params.connectionId,
    userId: params.actorUserId,
    organizationId: params.orgId,
  })
  return row
}

export interface ConnectionDecisionParams {
  connectionId: string
  /** The org acting — must be the connection's target org. */
  orgId: string
  actorUserId: string
}

/** Accept a pending connection. Only the target org may accept. Audited. */
export async function acceptConnection(
  db: GovcoreDb,
  params: ConnectionDecisionParams,
): Promise<OrgConnection> {
  return transitionByTarget(db, params, 'active', 'federation.connection.accept')
}

/** Reject a pending connection. Only the target org may reject. Audited. */
export async function rejectConnection(
  db: GovcoreDb,
  params: ConnectionDecisionParams,
): Promise<OrgConnection> {
  return transitionByTarget(db, params, 'rejected', 'federation.connection.reject')
}
