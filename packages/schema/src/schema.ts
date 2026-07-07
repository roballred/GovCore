// @govcore/schema — platform table definitions (identity, tenancy, auth, audit).
//
// Edge-safe: imports only `drizzle-orm/pg-core`, no DB client. The app imports
// these for type-safe queries and to declare foreign keys *to* platform tables.
// The govcore-migrate runner (./migrate) is a separate, non-edge entrypoint.
//
// All platform tables live in a dedicated `govcore` Postgres schema (design
// §13.4) so they never collide with an app's `public` tables and ownership is
// obvious. The authored DDL lives in ../migrations and must stay in sync.

import {
  type AnyPgColumn,
  boolean,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/** The Postgres schema every GovCore platform table belongs to. */
export const govcore = pgSchema('govcore')

/** Content/federation visibility. Used by the federation package (later phase). */
export const visibility = govcore.enum('visibility', ['org', 'connections', 'instance'])

/** Generic workflow status shared by federation connections and links. */
export const federationStatus = govcore.enum('federation_status', ['pending', 'active', 'rejected'])

// ── Tenancy root ────────────────────────────────────────────────────────────

export const organizations = govcore.table(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    /**
     * Lifecycle state — see ORGANIZATION_STATUSES. `active` is the only state in
     * which a tenant transaction runs or a session resolves; `suspended` and
     * `archived` (soft-delete) are blocked at the createAuth + tenantAction gates.
     */
    status: text('status').notNull().default('active'),
    /** Why the org was suspended/archived — surfaced to operators; cleared on reinstate. */
    statusReason: text('status_reason'),
    statusChangedAt: timestamp('status_changed_at'),
    /** Historical UUID of the operator who last changed status — no FK on purpose. */
    statusChangedBy: uuid('status_changed_by'),
    /**
     * App-extensible bag for org settings GovCore itself doesn't model. NOT for
     * platform-modeled concerns (lifecycle now lives in `status`, not here); keys
     * are the consuming app's own namespace.
     */
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('organizations_slug_unique').on(t.slug)],
)

/** Organization lifecycle states. Only `active` permits tenant access. */
export const ORGANIZATION_STATUSES = ['active', 'suspended', 'archived'] as const
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number]

/** Pure: may an org in this status resolve sessions and run tenant transactions? */
export function isOrganizationActive(status: string | null | undefined): boolean {
  return status === 'active'
}

/**
 * The tenancy column contract (design §5): every tenant-scoped table — core's
 * and the app's own domain tables — carries `organization_id` referencing
 * `organizations`. RLS policies (see ../migrations/0001) key off this column.
 *
 * @example
 * export const permits = pgTable('permits', { ...orgScoped(organizations), title: text('title') })
 */
export const orgScoped = (orgs: typeof organizations) => ({
  organizationId: uuid('organization_id')
    .notNull()
    .references((): AnyPgColumn => orgs.id, { onDelete: 'cascade' }),
})

// ── Identity ────────────────────────────────────────────────────────────────

export const users = govcore.table(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Last-selected active org, honored first by active-membership resolution. */
    lastActiveOrganizationId: uuid('last_active_organization_id').references(
      (): AnyPgColumn => organizations.id,
      { onDelete: 'set null' },
    ),
    name: text('name'),
    email: text('email').notNull(),
    emailVerified: timestamp('email_verified'),
    image: text('image'),
    passwordHash: text('password_hash'),
    /**
     * App-defined role (see @govcore/rbac `createRbac`) — stored as `text`, not
     * a fixed enum, so GovCore ships no role vocabulary of its own. Denormalized
     * cache of the active membership's role; nullable so the Auth.js adapter can
     * create a user before a membership is assigned.
     */
    role: text('role'),
    /** Platform-level role (e.g. instance/platform admin), separate from per-org role. */
    instanceRole: text('instance_role'),
    isActive: boolean('is_active').notNull().default(true),
    // Account-lockout + password-expiry state; the policy itself lives app-side.
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockoutUntil: timestamp('lockout_until'),
    lastPasswordChangedAt: timestamp('last_password_changed_at').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  // One identity per email across all orgs — unambiguous auth/SSO lookups.
  (t) => [uniqueIndex('users_email_unique').on(t.email)],
)

// Auth.js (drizzle-adapter) tables. Not org-scoped; read during auth flows
// before a tenant context exists, so they are intentionally outside RLS.

export const accounts = govcore.table('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refreshToken: text('refresh_token'),
  accessToken: text('access_token'),
  expiresAt: timestamp('expires_at'),
  tokenType: text('token_type'),
  scope: text('scope'),
  idToken: text('id_token'),
  sessionState: text('session_state'),
})

export const sessions = govcore.table('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionToken: text('session_token').notNull().unique(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires').notNull(),
})

export const verificationTokens = govcore.table('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: timestamp('expires').notNull(),
})

// ── Membership model (the heart of tenancy) ─────────────────────────────────

export const userOrganizationMemberships = govcore.table(
  'user_organization_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** App-defined role for this membership (text, not an enum — see `users.role`). */
    role: text('role').notNull(),
    /** Revocation soft-deactivates so the historical row survives for audit. */
    isActive: boolean('is_active').notNull().default(true),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('user_org_membership_unique').on(t.userId, t.organizationId)],
)

// ── Audit (append-only; immutability + RLS in ../migrations/0001) ───────────

export const auditLog = govcore.table('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id'), // historical UUID — no FK on purpose
  userId: uuid('user_id'), // historical UUID — no FK on purpose
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id'),
  before: jsonb('before'),
  after: jsonb('after'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// ── Federation (cross-organization connections and content links) ──────────

/** Explicit bilateral connection between two organizations. */
export const orgConnections = govcore.table(
  'org_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fromOrgId: uuid('from_org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    toOrgId: uuid('to_org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    status: federationStatus('status').notNull().default('pending'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('unique_org_connection').on(t.fromOrgId, t.toOrgId)],
)

/** Approved relationship between content items across orgs. No FK on entity ids
 *  (they cross org boundaries); link semantics are app-defined (`link_type` text). */
export const crossOrgLinks = govcore.table('cross_org_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceOrgId: uuid('source_org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  sourceEntityType: text('source_entity_type').notNull(),
  sourceEntityId: uuid('source_entity_id').notNull(),
  targetOrgId: uuid('target_org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  targetEntityType: text('target_entity_type').notNull(),
  targetEntityId: uuid('target_entity_id').notNull(),
  linkType: text('link_type').notNull(),
  status: federationStatus('status').notNull().default('pending'),
  rejectionReason: text('rejection_reason'),
  flaggedForReview: boolean('flagged_for_review').notNull().default(false),
  flagReason: text('flag_reason'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// ── Support access (break-glass + act-as) ──────────────────────────────────
// Instance-operator constructs that deliberately cross the tenant boundary, so
// they are NOT under the org-GUC RLS (the actor is an instance admin operating
// across orgs). Authorization is enforced in @govcore/support (design §6.6).

export const breakGlassSessions = govcore.table('break_glass_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  instanceAdminId: uuid('instance_admin_id')
    .notNull()
    .references(() => users.id),
  targetOrgId: uuid('target_org_id')
    .notNull()
    .references(() => organizations.id),
  reason: text('reason').notNull(),
  grantedAt: timestamp('granted_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
  requiresApproval: boolean('requires_approval').notNull().default(false),
  approvedAt: timestamp('approved_at'),
  approvedBy: uuid('approved_by').references(() => users.id),
  revokedAt: timestamp('revoked_at'),
  revokedBy: uuid('revoked_by').references(() => users.id),
})

export const actAsSessions = govcore.table('act_as_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  breakGlassSessionId: uuid('break_glass_session_id')
    .notNull()
    .references(() => breakGlassSessions.id),
  instanceAdminId: uuid('instance_admin_id')
    .notNull()
    .references(() => users.id),
  targetOrgId: uuid('target_org_id')
    .notNull()
    .references(() => organizations.id),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
  endedAt: timestamp('ended_at'),
  endReason: text('end_reason'),
})

export const ACT_AS_DEFAULT_TTL_MINUTES = 30
export const ACT_AS_END_REASONS = [
  'admin_ended',
  'expired',
  'parent_revoked',
  'parent_expired',
] as const
export type ActAsEndReason = (typeof ACT_AS_END_REASONS)[number]

// ── Instance / platform configuration (singletons; not org-scoped) ─────────

export const instanceSettings = govcore.table('instance_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  disabledModules: jsonb('disabled_modules').$type<Record<string, boolean>>().notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const platformConfig = govcore.table('platform_config', {
  id: text('id').primaryKey().default('singleton'),
  instanceName: text('instance_name').notNull().default('GovCore'),
  defaultTheme: text('default_theme').notNull().default('base'),
  allowLocalAuth: boolean('allow_local_auth').notNull().default(true),
  /** Stamped onto new orgs at provisioning time. Null means no tier. */
  defaultSupportTier: text('default_support_tier'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
})

// ── Inferred types ──────────────────────────────────────────────────────────

export type Organization = typeof organizations.$inferSelect
export type NewOrganization = typeof organizations.$inferInsert
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type UserOrganizationMembership = typeof userOrganizationMemberships.$inferSelect
export type NewUserOrganizationMembership = typeof userOrganizationMemberships.$inferInsert
export type AuditEntry = typeof auditLog.$inferSelect
export type NewAuditEntry = typeof auditLog.$inferInsert
export type OrgConnection = typeof orgConnections.$inferSelect
export type NewOrgConnection = typeof orgConnections.$inferInsert
export type CrossOrgLink = typeof crossOrgLinks.$inferSelect
export type NewCrossOrgLink = typeof crossOrgLinks.$inferInsert
export type BreakGlassSession = typeof breakGlassSessions.$inferSelect
export type NewBreakGlassSession = typeof breakGlassSessions.$inferInsert
export type ActAsSession = typeof actAsSessions.$inferSelect
export type NewActAsSession = typeof actAsSessions.$inferInsert
export type InstanceSettings = typeof instanceSettings.$inferSelect
export type NewInstanceSettings = typeof instanceSettings.$inferInsert
export type PlatformConfig = typeof platformConfig.$inferSelect
export type NewPlatformConfig = typeof platformConfig.$inferInsert
