// @govcore/federation/visibility — federated read scoping.
//
// Content rows carry a `visibility` (org | connections | instance). A list query
// is scoped to the caller's org by default; broadening to `federated` also pulls
// in instance-wide rows and rows owned by a *connected* org whose visibility
// permits it. These helpers build the query condition and answer single-row
// read checks; the content tables themselves are app-owned (content is a later
// milestone), so callers pass the columns.

import { and, eq, inArray, or, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { orgConnections, type GovcoreDb } from '@govcore/schema'

/** A content row's visibility vocabulary (mirrors the `visibility` schema enum). */
export type FederationVisibility = 'org' | 'connections' | 'instance'

/**
 * List-view scope. `org` (default) restricts to the caller's own org;
 * `federated` is an explicit, user-requested broadening so list queries never
 * silently fan out across every visible org.
 */
export type ListScope = 'org' | 'federated'

/** Coerce a raw query-string value into a ListScope, defaulting to `org`. */
export function parseListScope(value: string | string[] | undefined): ListScope {
  return value === 'federated' ? 'federated' : 'org'
}

/**
 * Build the visibility WHERE condition for an org-scoped list query.
 *
 * - `org` scope → only rows owned by `orgId`.
 * - `federated` scope → owned rows, plus instance-wide rows, plus
 *   connections/instance rows owned by a connected org.
 *
 * Pass `connectedOrgIds` empty under `org` scope (callers should skip the
 * connected-org lookup there). Compose with any status filter via `and(...)`.
 */
export function listScopeFilter(
  cols: { organizationId: AnyPgColumn; visibility: AnyPgColumn },
  opts: { orgId: string; scope: ListScope; connectedOrgIds?: string[] },
): SQL {
  const base = eq(cols.organizationId, opts.orgId)
  if (opts.scope === 'org') return base

  const instanceWide = eq(cols.visibility, 'instance')
  const connectedOrgIds = opts.connectedOrgIds ?? []
  if (connectedOrgIds.length === 0) return or(base, instanceWide)!
  return or(
    base,
    instanceWide,
    and(
      inArray(cols.organizationId, connectedOrgIds),
      inArray(cols.visibility, ['connections', 'instance']),
    ),
  )!
}

/**
 * Throw if an entity's owning org doesn't match the caller's. Use before any
 * write to content fetched without an org filter.
 */
export function assertOwnership(
  entityOrgId: string | null | undefined,
  callerOrgId: string,
): void {
  if (!entityOrgId || entityOrgId !== callerOrgId) {
    throw new Error('Forbidden: content owned by another organization')
  }
}

/** Org IDs with an *active* bilateral connection to `organizationId` (either direction). */
export async function getConnectedOrgIds(
  db: GovcoreDb,
  organizationId: string,
): Promise<string[]> {
  const rows = await db
    .select({ fromOrgId: orgConnections.fromOrgId, toOrgId: orgConnections.toOrgId })
    .from(orgConnections)
    .where(
      and(
        or(
          eq(orgConnections.fromOrgId, organizationId),
          eq(orgConnections.toOrgId, organizationId),
        ),
        eq(orgConnections.status, 'active'),
      ),
    )
  return rows.map((r) => (r.fromOrgId === organizationId ? r.toOrgId : r.fromOrgId))
}

/**
 * Whether `callerOrgId` may read a single entity given its owning org and
 * visibility. Own-org always; `instance` always; `connections` only when an
 * active connection exists. A null org/visibility is unreadable.
 */
export async function canReadFederatedEntity(
  db: GovcoreDb,
  entityOrgId: string | null | undefined,
  visibility: FederationVisibility | null | undefined,
  callerOrgId: string,
): Promise<boolean> {
  if (!entityOrgId || !visibility) return false
  if (entityOrgId === callerOrgId) return true
  if (visibility === 'instance') return true
  if (visibility !== 'connections') return false

  const connectedOrgIds = await getConnectedOrgIds(db, callerOrgId)
  return connectedOrgIds.includes(entityOrgId)
}
