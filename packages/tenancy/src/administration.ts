// @govcore/tenancy — operator-plane organization & user administration.
//
// These are the cross-org mutations behind an instance console: create/rename an
// organization, and change a user's role/active/instance-admin. Every consumer
// rebuilds them (GovEA `actions/instance.ts`, GovCRM `lib/platform.ts`) and the
// user path is where they diverge — GovCRM guarded the last admin by counting
// `users.role`, GovEA by membership rows. Here the user mutation composes the
// membership invariants (assertNotLastActiveAdmin + upsertMembership) so the
// guard and the write-sync are the same everywhere.
//
// Framework-agnostic: no FormData, redirects, or revalidation. The consumer
// keeps the thin `'use server'` wrapper (parse, gate to instance_admin, route
// the typed result); these own the DB write + audit. Roles are app-defined text
// — pass your admin role name for the last-admin guard.

import { eq } from 'drizzle-orm'
import {
  organizations,
  users,
  isUniqueViolation,
  type GovcoreDb,
  type Organization,
} from '@govcore/schema'
import { writeAuditLog } from '@govcore/audit'
import { assertNotLastActiveAdmin, LastActiveAdminError } from './guards'
import { upsertMembership } from './sync'
import { findMembership } from './memberships'

/** Derive a URL-safe slug from a display name (lowercase, non-alphanumerics → `-`). */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export type CreateOrganizationResult =
  | { ok: true; organization: Organization }
  | { ok: false; reason: 'name-required' | 'slug-taken' }

/**
 * Create an organization and audit it as `platform.org.create`. `slug` defaults
 * to {@link slugify}(name); a collision on the unique slug returns a typed
 * `slug-taken` rather than throwing.
 */
export async function createOrganization(
  db: GovcoreDb,
  opts: { name: string; slug?: string; actorUserId: string },
): Promise<CreateOrganizationResult> {
  const name = opts.name.trim()
  if (!name) return { ok: false, reason: 'name-required' }
  const slug = opts.slug?.trim() || slugify(name)

  try {
    const organization = await db.transaction(async (tx) => {
      const [org] = await tx.insert(organizations).values({ name, slug }).returning()
      await writeAuditLog(tx, {
        action: 'platform.org.create',
        entityType: 'organization',
        entityId: org.id,
        organizationId: org.id,
        userId: opts.actorUserId,
        after: { name, slug },
      })
      return org
    })
    return { ok: true, organization }
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: 'slug-taken' }
    throw err
  }
}

export type RenameOrganizationResult =
  | { ok: true }
  | { ok: false; reason: 'name-required' | 'not-found' }

/**
 * Rename an organization and audit the before/after as `platform.org.update`.
 * The slug is deliberately immutable — it identifies the tenant — so this
 * changes only the display name.
 */
export async function renameOrganization(
  db: GovcoreDb,
  opts: { organizationId: string; name: string; actorUserId: string },
): Promise<RenameOrganizationResult> {
  const name = opts.name.trim()
  if (!name) return { ok: false, reason: 'name-required' }

  const [before] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, opts.organizationId))
  if (!before) return { ok: false, reason: 'not-found' }
  if (before.name === name) return { ok: true }

  await db.transaction(async (tx) => {
    await tx
      .update(organizations)
      .set({ name, updatedAt: new Date() })
      .where(eq(organizations.id, opts.organizationId))
    await writeAuditLog(tx, {
      action: 'platform.org.update',
      entityType: 'organization',
      entityId: opts.organizationId,
      organizationId: opts.organizationId,
      userId: opts.actorUserId,
      before: { name: before.name },
      after: { name },
    })
  })
  return { ok: true }
}

export type UpdateUserAdministrationResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'own-instance-admin' | 'last-admin' }

/**
 * Change a user's org role, active flag, and instance-admin grant from the
 * operator console. Enforces two guards and keeps the membership row in lockstep
 * with the denormalized `users` columns:
 *
 *   - **own-instance-admin** — an operator cannot strip their *own* instance
 *     admin (lockout protection).
 *   - **last-admin** — the org's last active admin cannot be demoted or
 *     deactivated ({@link assertNotLastActiveAdmin}, evaluated inside the
 *     transaction so the count and the write see one snapshot).
 *
 * Audited as `platform.user.update` with before/after. `adminRole` is the role
 * name that counts as admin for the last-admin guard.
 */
export async function updateUserAdministration(
  db: GovcoreDb,
  opts: {
    userId: string
    role: string
    isActive: boolean
    instanceAdmin: boolean
    actorUserId: string
    adminRole: string
  },
): Promise<UpdateUserAdministrationResult> {
  const [target] = await db.select().from(users).where(eq(users.id, opts.userId))
  if (!target) return { ok: false, reason: 'not-found' }

  // An operator removing their own instance-admin would lock the platform out.
  if (
    opts.actorUserId === target.id &&
    target.instanceRole === 'instance_admin' &&
    !opts.instanceAdmin
  ) {
    return { ok: false, reason: 'own-instance-admin' }
  }

  // The last-admin guard is a membership-set question; fall back to the
  // denormalized users columns only for a legacy account with no membership row.
  const membership = await findMembership(db, target.id, target.organizationId)
  const change = {
    currentRole: membership?.role ?? target.role ?? '',
    currentIsActive: membership?.isActive ?? target.isActive,
    nextRole: opts.role,
    nextIsActive: opts.isActive,
  }

  try {
    await db.transaction(async (tx) => {
      await assertNotLastActiveAdmin(tx, {
        organizationId: target.organizationId,
        adminRole: opts.adminRole,
        change,
      })
      await tx
        .update(users)
        .set({
          role: opts.role,
          isActive: opts.isActive,
          instanceRole: opts.instanceAdmin ? 'instance_admin' : null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, target.id))
      await upsertMembership(tx, {
        userId: target.id,
        organizationId: target.organizationId,
        role: opts.role,
        isActive: opts.isActive,
      })
      await writeAuditLog(tx, {
        action: 'platform.user.update',
        entityType: 'user',
        entityId: target.id,
        organizationId: target.organizationId,
        userId: opts.actorUserId,
        before: {
          role: target.role,
          isActive: target.isActive,
          instanceRole: target.instanceRole,
        },
        after: {
          role: opts.role,
          isActive: opts.isActive,
          instanceRole: opts.instanceAdmin ? 'instance_admin' : null,
        },
      })
    })
  } catch (err) {
    if (err instanceof LastActiveAdminError) return { ok: false, reason: 'last-admin' }
    throw err
  }
  return { ok: true }
}
