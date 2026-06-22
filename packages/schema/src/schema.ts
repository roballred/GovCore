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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/** The Postgres schema every GovCore platform table belongs to. */
export const govcore = pgSchema('govcore')

/** Content/federation visibility. Used by the federation package (later phase). */
export const visibility = govcore.enum('visibility', ['org', 'connections', 'instance'])

// ── Tenancy root ────────────────────────────────────────────────────────────

export const organizations = govcore.table(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    /** App-extensible bag for org settings GovCore itself doesn't model. */
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('organizations_slug_unique').on(t.slug)],
)

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

// ── Inferred types ──────────────────────────────────────────────────────────

export type Organization = typeof organizations.$inferSelect
export type NewOrganization = typeof organizations.$inferInsert
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type UserOrganizationMembership = typeof userOrganizationMemberships.$inferSelect
export type NewUserOrganizationMembership = typeof userOrganizationMemberships.$inferInsert
export type AuditEntry = typeof auditLog.$inferSelect
export type NewAuditEntry = typeof auditLog.$inferInsert
