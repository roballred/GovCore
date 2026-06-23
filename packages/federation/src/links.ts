// @govcore/federation/links — the cross-org content-link lifecycle.
//
// A cross-org link is an approved relationship between a content item in one org
// and one in another. Entity ids carry no FK (they cross org boundaries) and the
// link semantics are app-defined: `linkType`, `sourceEntityType`/`targetEntityType`
// are plain strings here. The *source* org proposes a link; only the *target* org
// approves or rejects it. Entity ownership and federated-visibility preconditions
// are the caller's responsibility (they live over app-owned content) — this module
// owns the link record and its transitions. Each transition is audited.

import { and, eq, inArray, or } from 'drizzle-orm'
import { crossOrgLinks, type GovcoreDb } from '@govcore/schema'
import { writeAuditLog } from '@govcore/audit'

export type CrossOrgLink = typeof crossOrgLinks.$inferSelect

/** What to do with a link request given any existing link for the same pair. */
export type LinkRequestAction = 'block' | 'reactivate' | 'create'

/**
 * Pure: a pending/active link blocks a new request; a previously rejected one is
 * reactivated; otherwise a fresh link is created.
 */
export function resolveLinkRequest(
  existing: Pick<CrossOrgLink, 'status'> | null | undefined,
): LinkRequestAction {
  if (!existing) return 'create'
  if (existing.status === 'pending' || existing.status === 'active') return 'block'
  return 'reactivate'
}

const touchesEntity = (entityType: string, entityId: string) =>
  or(
    and(eq(crossOrgLinks.sourceEntityType, entityType), eq(crossOrgLinks.sourceEntityId, entityId)),
    and(eq(crossOrgLinks.targetEntityType, entityType), eq(crossOrgLinks.targetEntityId, entityId)),
  )

const betweenOrgs = (orgAId: string, orgBId: string) =>
  or(
    and(eq(crossOrgLinks.sourceOrgId, orgAId), eq(crossOrgLinks.targetOrgId, orgBId)),
    and(eq(crossOrgLinks.sourceOrgId, orgBId), eq(crossOrgLinks.targetOrgId, orgAId)),
  )

/** All links where `orgId` is either the source or target org. */
export async function getCrossOrgLinks(db: GovcoreDb, orgId: string): Promise<CrossOrgLink[]> {
  return db
    .select()
    .from(crossOrgLinks)
    .where(or(eq(crossOrgLinks.sourceOrgId, orgId), eq(crossOrgLinks.targetOrgId, orgId)))
}

/** All links touching a given entity (on either side). */
export async function getLinksForEntity(
  db: GovcoreDb,
  entityType: string,
  entityId: string,
): Promise<CrossOrgLink[]> {
  return db.select().from(crossOrgLinks).where(touchesEntity(entityType, entityId))
}

export interface LinkEndpoints {
  sourceEntityType: string
  sourceEntityId: string
  targetEntityType: string
  targetEntityId: string
}

/** The existing link for an exact source→target entity pair, or null. */
export async function findCrossOrgLink(
  db: GovcoreDb,
  ends: LinkEndpoints,
): Promise<CrossOrgLink | null> {
  const [row] = await db
    .select()
    .from(crossOrgLinks)
    .where(
      and(
        eq(crossOrgLinks.sourceEntityType, ends.sourceEntityType),
        eq(crossOrgLinks.sourceEntityId, ends.sourceEntityId),
        eq(crossOrgLinks.targetEntityType, ends.targetEntityType),
        eq(crossOrgLinks.targetEntityId, ends.targetEntityId),
      ),
    )
    .limit(1)
  return row ?? null
}

export interface RequestCrossOrgLinkParams extends LinkEndpoints {
  sourceOrgId: string
  targetOrgId: string
  linkType: string
  actorUserId: string
}

/**
 * Propose a cross-org link. Blocks if a pending/active link for the pair already
 * exists; reactivates a previously rejected one; otherwise creates a pending
 * link. Audited. Entity ownership/visibility must be validated by the caller.
 */
export async function requestCrossOrgLink(
  db: GovcoreDb,
  params: RequestCrossOrgLinkParams,
): Promise<CrossOrgLink> {
  if (params.sourceOrgId === params.targetOrgId) {
    throw new Error('Use same-org relationships for links within one organization')
  }

  const existing = await findCrossOrgLink(db, params)
  const action = resolveLinkRequest(existing)
  if (action === 'block') {
    throw new Error('A cross-org link already exists or is awaiting approval')
  }

  let link: CrossOrgLink
  if (action === 'reactivate' && existing) {
    const [row] = await db
      .update(crossOrgLinks)
      .set({ linkType: params.linkType, status: 'pending', rejectionReason: null, updatedAt: new Date() })
      .where(eq(crossOrgLinks.id, existing.id))
      .returning()
    link = row
  } else {
    const [row] = await db
      .insert(crossOrgLinks)
      .values({
        sourceOrgId: params.sourceOrgId,
        sourceEntityType: params.sourceEntityType,
        sourceEntityId: params.sourceEntityId,
        targetOrgId: params.targetOrgId,
        targetEntityType: params.targetEntityType,
        targetEntityId: params.targetEntityId,
        linkType: params.linkType,
        status: 'pending',
        createdBy: params.actorUserId,
      })
      .returning()
    link = row
  }

  await writeAuditLog(db, {
    action: 'federation.cross_org_link.request',
    entityType: 'cross_org_link',
    entityId: link.id,
    userId: params.actorUserId,
    organizationId: params.sourceOrgId,
    after: {
      sourceEntityId: params.sourceEntityId,
      targetEntityId: params.targetEntityId,
      linkType: params.linkType,
      targetOrgId: params.targetOrgId,
    },
  })
  return link
}

/** Internal: a target-org-only status transition with an audit row. */
async function transitionByTarget(
  db: GovcoreDb,
  params: { linkId: string; orgId: string; actorUserId: string; reason?: string },
  status: 'active' | 'rejected',
  action: string,
): Promise<CrossOrgLink> {
  const [link] = await db
    .select()
    .from(crossOrgLinks)
    .where(and(eq(crossOrgLinks.id, params.linkId), eq(crossOrgLinks.targetOrgId, params.orgId)))
    .limit(1)
  if (!link) throw new Error('Cross-org link not found or not authorized')
  if (link.status !== 'pending') throw new Error('Only pending links can be approved or rejected')

  const [row] = await db
    .update(crossOrgLinks)
    .set({
      status,
      rejectionReason: status === 'rejected' && params.reason?.trim() ? params.reason.trim() : null,
      updatedAt: new Date(),
    })
    .where(eq(crossOrgLinks.id, params.linkId))
    .returning()

  await writeAuditLog(db, {
    action,
    entityType: 'cross_org_link',
    entityId: params.linkId,
    userId: params.actorUserId,
    organizationId: params.orgId,
    after: { sourceEntityId: link.sourceEntityId, targetEntityId: link.targetEntityId },
  })
  return row
}

export interface LinkDecisionParams {
  linkId: string
  /** The acting org — must be the link's target org. */
  orgId: string
  actorUserId: string
}

/** Approve a pending link. Target org only. Audited. */
export async function approveCrossOrgLink(
  db: GovcoreDb,
  params: LinkDecisionParams,
): Promise<CrossOrgLink> {
  return transitionByTarget(db, params, 'active', 'federation.cross_org_link.approve')
}

/** Reject a pending link with an optional reason. Target org only. Audited. */
export async function rejectCrossOrgLink(
  db: GovcoreDb,
  params: LinkDecisionParams & { reason?: string },
): Promise<CrossOrgLink> {
  return transitionByTarget(db, params, 'rejected', 'federation.cross_org_link.reject')
}

/** Internal: delete a link the acting org owns on the given side, audited. */
async function deleteOwnedLink(
  db: GovcoreDb,
  params: { linkId: string; orgId: string; actorUserId: string; requireActive?: boolean },
  ownerColumn: typeof crossOrgLinks.sourceOrgId | typeof crossOrgLinks.targetOrgId,
  action: string,
): Promise<CrossOrgLink> {
  const [link] = await db
    .select()
    .from(crossOrgLinks)
    .where(and(eq(crossOrgLinks.id, params.linkId), eq(ownerColumn, params.orgId)))
    .limit(1)
  if (!link) throw new Error('Cross-org link not found or not authorized')
  if (params.requireActive && link.status !== 'active') {
    throw new Error('Only active links can be revoked')
  }

  await db.delete(crossOrgLinks).where(eq(crossOrgLinks.id, params.linkId))

  await writeAuditLog(db, {
    action,
    entityType: 'cross_org_link',
    entityId: params.linkId,
    userId: params.actorUserId,
    organizationId: params.orgId,
    before: {
      sourceEntityId: link.sourceEntityId,
      targetEntityId: link.targetEntityId,
      status: link.status,
    },
  })
  return link
}

/** Withdraw a link the *source* org proposed (any status). Audited. */
export async function withdrawCrossOrgLink(
  db: GovcoreDb,
  params: LinkDecisionParams,
): Promise<CrossOrgLink> {
  return deleteOwnedLink(db, params, crossOrgLinks.sourceOrgId, 'federation.cross_org_link.withdraw')
}

/** Revoke an active link from the *target* org. Audited. */
export async function revokeCrossOrgLink(
  db: GovcoreDb,
  params: LinkDecisionParams,
): Promise<CrossOrgLink> {
  return deleteOwnedLink(
    db,
    { ...params, requireActive: true },
    crossOrgLinks.targetOrgId,
    'federation.cross_org_link.revoke',
  )
}

/**
 * Flag every pending/active link touching an entity for review — used when the
 * entity's visibility drops so both orgs are alerted the link may no longer be
 * accessible. Caller must have verified the entity belongs to its org.
 */
export async function flagLinksForVisibilityDrop(
  db: GovcoreDb,
  entityType: string,
  entityId: string,
  reason: string,
): Promise<void> {
  await db
    .update(crossOrgLinks)
    .set({ flaggedForReview: true, flagReason: reason, updatedAt: new Date() })
    .where(and(touchesEntity(entityType, entityId), inArray(crossOrgLinks.status, ['pending', 'active'])))
}

/** Clear review flags on an entity's links — used when visibility is raised back. */
export async function clearLinksFlag(
  db: GovcoreDb,
  entityType: string,
  entityId: string,
): Promise<void> {
  await db
    .update(crossOrgLinks)
    .set({ flaggedForReview: false, flagReason: null, updatedAt: new Date() })
    .where(and(touchesEntity(entityType, entityId), eq(crossOrgLinks.flaggedForReview, true)))
}

/**
 * Delete every cross-org link between two orgs — called when their connection is
 * removed. Audits a snapshot of the removed links (when any) under the actor.
 * Returns the removed rows.
 */
export async function removeLinksForConnection(
  db: GovcoreDb,
  orgAId: string,
  orgBId: string,
  actorUserId: string,
  actorOrgId: string,
): Promise<CrossOrgLink[]> {
  const affected = await db.select().from(crossOrgLinks).where(betweenOrgs(orgAId, orgBId))
  if (affected.length === 0) return []

  await db.delete(crossOrgLinks).where(betweenOrgs(orgAId, orgBId))

  await writeAuditLog(db, {
    action: 'federation.cross_org_link.remove_for_connection',
    entityType: 'org_connection',
    userId: actorUserId,
    organizationId: actorOrgId,
    before: {
      orgAId,
      orgBId,
      removedLinkIds: affected.map((l) => l.id),
    },
  })
  return affected
}
