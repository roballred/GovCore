// @govcore/auth — the Auth.js (NextAuth v5) config factory.
//
// createAuth wraps: an injected OIDC provider list + a local Credentials
// provider (bcrypt), the Drizzle adapter over @govcore/schema, the SSO
// provisioning guard, JWT/session callbacks that stamp the active org/role from
// the membership model (@govcore/tenancy), login/logout audit, and the
// resurrection-guard marker deletion on sign-in. GovEA's product-specific per-org
// policy (lockout / session-timeout / password-expiry) is intentionally NOT here.

import NextAuth, { type NextAuthConfig } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { eq } from 'drizzle-orm'
import {
  accounts,
  organizations,
  sessions,
  users,
  verificationTokens,
  isOrganizationActive,
  type GovcoreDb,
} from '@govcore/schema'
import { resolveActiveMembership } from '@govcore/tenancy'
import { writeAuditLog } from '@govcore/audit'
import { verifyPassword } from './password'
import { checkSsoProvisioning } from './sso-guard'
import { LOGGED_OUT_MARKER_COOKIE } from './logout-marker'
import { type SecurityPolicy, PERMISSIVE_POLICY, computeLockout } from './lockout'

// The claims createAuth stamps onto the JWT / session. Kept LOCAL (used via a
// cast in the callbacks) rather than shipped as a global `declare module
// 'next-auth'` augmentation, so importing @govcore/auth does not override a
// consumer's own session typing — notably a consumer that types `role` as its
// own union rather than bare `string` (#108). Consumers own their `next-auth`
// module augmentation; single-role apps that want a ready-made one can opt into
// `import '@govcore/auth/next-auth'`.
interface GovcoreClaims {
  id?: string
  role?: string
  organizationId?: string | null
  instanceRole?: string | null
  checkedAt?: number
  // Security-policy snapshot (#107) — mirrored into the JWT so an edge middleware
  // (no DB access) can make session-timeout / password-expiry redirect decisions.
  issuedAt?: number
  sessionTimeoutMinutes?: number
  passwordExpiryDays?: number
  lastPasswordChangedAt?: number | null
}

interface GovcoreSessionUser {
  id: string
  role: string
  organizationId: string | null
  instanceRole: string | null
  sessionTimeoutMinutes?: number
  passwordExpiryDays?: number
  lastPasswordChangedAt?: number | null
}

export interface CreateAuthOptions {
  /**
   * The app's Drizzle db (postgres-js). Used for identity/session work unless
   * `authDb` is given, in which case `authDb` handles all of it and this is
   * unused by createAuth (still accepted so single-pool setups pass just `db`).
   */
  db: GovcoreDb
  /**
   * Identity-plane db for the pre-/cross-session reads createAuth performs.
   *
   * Under the two-role split the runtime `db` connects as a non-owner, so every
   * read of `govcore.users`/memberships is FORCE-RLS-filtered by the
   * `app.current_org` GUC — which cannot exist before a session does. A
   * credentials login therefore finds zero rows and fails with CredentialsSignin.
   * Pass a pool that bypasses that RLS here — a superuser or a `BYPASSRLS`
   * role (note: FORCE RLS binds even the table owner, so the owner alone is not
   * enough); createAuth uses it for the Auth.js adapter, the credentials lookup,
   * the SSO-provisioning check, active-membership resolution, and login/logout
   * audit — all of which run before or across any tenant context.
   *
   * Defaults to `db` — correct for single-role/dev setups where the identity
   * tables are not RLS-restricted before a session exists.
   */
  authDb?: GovcoreDb
  /** OIDC providers to enable (e.g. MicrosoftEntraID(...)). Local credentials are always added. */
  providers?: NextAuthConfig['providers']
  /** Role assigned when neither a membership nor a denormalized role is present. */
  defaultRole?: string
  /** Session cookie max age (seconds). Default 24h. */
  sessionMaxAgeSeconds?: number
  /** Override the NextAuth pages. */
  pages?: { signIn?: string; error?: string }
  /**
   * Per-org {@link SecurityPolicy} (#107). Called in the credentials flow (to
   * enforce account lockout) and in the `jwt` callback (to snapshot session
   * timeout / password expiry onto the token). Omit for {@link PERMISSIVE_POLICY}
   * — no lockout, no timeout — which keeps createAuth's prior behavior.
   */
  securityPolicy?: (organizationId: string | null) => Promise<SecurityPolicy> | SecurityPolicy
  /**
   * Extra request telemetry merged into login/logout audit metadata (e.g.
   * proxy-aware ip / user-agent). Called per auth event; runs in the auth context.
   */
  authContext?: () => Promise<{ ip?: string; userAgent?: string }> | { ip?: string; userAgent?: string }
  /**
   * Called after the Auth.js adapter creates a user (typically SSO first login).
   * Return `'deactivate'` to deactivate an anomalous identity — e.g. an org-less
   * non-instance-admin that slipped past the invite-binding gate. createAuth then
   * deactivates the user and writes an `auth.sso_org_binding_failed` audit. The
   * default `'ok'` keeps the user.
   */
  onCreateUser?: (user: {
    id: string
    email: string | null
    organizationId: string | null
    instanceRole: string | null
  }) => Promise<'ok' | 'deactivate'> | 'ok' | 'deactivate'
}

export function createAuth(opts: CreateAuthOptions) {
  // Everything createAuth touches (adapter, credentials lookup, membership
  // resolution, login/logout audit) is identity-plane and runs before/across a
  // tenant context, so it all uses the RLS-bypassing authDb when supplied.
  const db = opts.authDb ?? opts.db
  const defaultRole = opts.defaultRole ?? 'viewer'

  const resolvePolicy = async (organizationId: string | null): Promise<SecurityPolicy> =>
    (await opts.securityPolicy?.(organizationId)) ?? PERMISSIVE_POLICY
  const telemetry = async (): Promise<{ ip?: string; userAgent?: string }> =>
    (await opts.authContext?.()) ?? {}

  // Mirror the active org's session-timeout / password-expiry policy onto the
  // token (#107), so an edge middleware — which cannot touch the DB — can read it.
  const snapshotPolicy = async (claims: GovcoreClaims, lastPasswordChangedAt: Date | null | undefined) => {
    const policy = await resolvePolicy(claims.organizationId ?? null)
    claims.sessionTimeoutMinutes = policy.sessionTimeoutMinutes
    claims.passwordExpiryDays = policy.passwordExpiryDays
    claims.lastPasswordChangedAt = lastPasswordChangedAt ? new Date(lastPasswordChangedAt).getTime() : null
  }

  // Org lifecycle gate: a session may not resolve for a suspended/archived org.
  // `null` (no org resolved) is not blocked here — that is a membership concern.
  const orgIsActive = async (orgId: string | null | undefined): Promise<boolean> => {
    if (!orgId) return true
    const [org] = await db
      .select({ status: organizations.status })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1)
    return !org || isOrganizationActive(org.status)
  }

  return NextAuth({
    session: { strategy: 'jwt', maxAge: opts.sessionMaxAgeSeconds ?? 60 * 60 * 24 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adapter: DrizzleAdapter(db as any, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any),
    providers: [
      ...(opts.providers ?? []),
      Credentials({
        credentials: {
          email: { label: 'Email', type: 'email' },
          password: { label: 'Password', type: 'password' },
        },
        async authorize(credentials) {
          const email = credentials?.email as string | undefined
          const password = credentials?.password as string | undefined
          if (!email || !password) return null
          const meta = { email, ...(await telemetry()) }

          const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
          if (!user || !user.passwordHash || !user.isActive) {
            await writeAuditLog(db, {
              action: 'auth.login_failed',
              entityType: 'user',
              organizationId: user?.organizationId,
              metadata: { ...meta, reason: 'invalid_credentials' },
            })
            return null
          }

          // Account lockout (#107). Check the lock BEFORE the password compare so a
          // continuous attack on a locked account gets no timing oracle about
          // password correctness (NIST 800-63B §5.2.2).
          if (user.lockoutUntil && new Date(user.lockoutUntil) > new Date()) {
            await writeAuditLog(db, {
              action: 'auth.login_blocked_locked',
              entityType: 'user',
              entityId: user.id,
              organizationId: user.organizationId,
              metadata: { ...meta, reason: 'locked_account', lockoutUntil: user.lockoutUntil.toISOString() },
            })
            return null
          }

          const valid = await verifyPassword(password, user.passwordHash)
          if (!valid) {
            // Increment the failure counter; lock when it crosses the org threshold.
            const policy = await resolvePolicy(user.organizationId)
            const { failedLoginAttempts: attempts, lockoutUntil } = computeLockout(user.failedLoginAttempts, policy)
            const shouldLock = lockoutUntil !== null
            await db.update(users).set({ failedLoginAttempts: attempts, lockoutUntil }).where(eq(users.id, user.id))
            await writeAuditLog(db, {
              action: shouldLock ? 'auth.login_failed_locked' : 'auth.login_failed',
              entityType: 'user',
              entityId: user.id,
              organizationId: user.organizationId,
              metadata: { ...meta, reason: 'invalid_credentials', attempts, lockedUntil: lockoutUntil?.toISOString() ?? null },
            })
            return null
          }

          // Success — clear any prior failure/lock state.
          if (user.failedLoginAttempts > 0 || user.lockoutUntil) {
            await db.update(users).set({ failedLoginAttempts: 0, lockoutUntil: null }).where(eq(users.id, user.id))
          }

          return { id: user.id, email: user.email, name: user.name }
        },
      }),
    ],
    callbacks: {
      async signIn({ user, account }) {
        // SSO identities must map to a pre-provisioned, active user (invite-based).
        if (account?.provider !== 'credentials') {
          if (!user.email) return false
          const check = await checkSsoProvisioning(db, user.email)
          if (check.status !== 'allowed') return false
        }
        return true
      },
      async jwt({ token, user, trigger }) {
        const claims = token as GovcoreClaims
        if (user) {
          // Initial sign-in — resolve active org/role from the DB (never trust the
          // provider's claims about our roles).
          const [dbUser] = await db.select().from(users).where(eq(users.id, user.id!)).limit(1)
          const active = await resolveActiveMembership(db, user.id!, dbUser?.lastActiveOrganizationId)
          claims.id = user.id
          claims.role = active?.role ?? dbUser?.role ?? defaultRole
          claims.organizationId = active?.organizationId ?? dbUser?.organizationId ?? null
          claims.instanceRole = dbUser?.instanceRole ?? null
          claims.checkedAt = Date.now()
          // Deny the session if the resolved org is suspended/archived.
          if (!(await orgIsActive(claims.organizationId))) return null
          // #107 — stamp session-age origin + the per-org policy snapshot.
          claims.issuedAt = Date.now()
          await snapshotPolicy(claims, dbUser?.lastPasswordChangedAt)
        } else if (claims.id) {
          const uid = claims.id
          if (trigger === 'update') {
            // Explicit active-org switch — re-resolve server-authoritatively.
            const [dbUser] = await db.select().from(users).where(eq(users.id, uid)).limit(1)
            if (dbUser) {
              const active = await resolveActiveMembership(db, uid, dbUser.lastActiveOrganizationId)
              claims.role = active?.role ?? dbUser.role ?? defaultRole
              claims.organizationId = active?.organizationId ?? dbUser.organizationId ?? null
              // Refresh the policy snapshot for the newly active org (#107).
              await snapshotPolicy(claims, dbUser.lastPasswordChangedAt)
            }
            return token
          }
          // Re-validate isActive every 5 minutes so deactivation takes effect
          // without waiting for the 24h JWT to expire.
          const CHECK_INTERVAL_MS = 5 * 60 * 1000
          const lastCheck = claims.checkedAt ?? 0
          if (Date.now() - lastCheck > CHECK_INTERVAL_MS) {
            const [dbUser] = await db.select().from(users).where(eq(users.id, uid)).limit(1)
            if (!dbUser || !dbUser.isActive) return null
            // Drop the session within the interval if the org was suspended/archived.
            if (!(await orgIsActive(claims.organizationId))) return null
            claims.instanceRole = dbUser.instanceRole ?? null
            claims.checkedAt = Date.now()
            // Refresh the policy snapshot on the same cadence (#107).
            await snapshotPolicy(claims, dbUser.lastPasswordChangedAt)
          }
          // #107 — per-org session timeout. NextAuth's static maxAge is the ceiling;
          // the per-org policy lowers it. Age is measured from `issuedAt` (session
          // origin), matching "reauthenticate after N minutes of session age".
          const timeout = claims.sessionTimeoutMinutes
          if (timeout && claims.issuedAt && Date.now() - claims.issuedAt > timeout * 60_000) {
            return null
          }
        }
        return token
      },
      async session({ session, token }) {
        const claims = token as GovcoreClaims
        if (session.user) {
          const su = session.user as unknown as GovcoreSessionUser
          su.id = claims.id ?? ''
          su.role = claims.role ?? defaultRole
          su.organizationId = claims.organizationId ?? null
          su.instanceRole = claims.instanceRole ?? null
          // #107 — surface the policy snapshot so the app + middleware can act on it.
          su.sessionTimeoutMinutes = claims.sessionTimeoutMinutes ?? 0
          su.passwordExpiryDays = claims.passwordExpiryDays ?? 0
          su.lastPasswordChangedAt = claims.lastPasswordChangedAt ?? null
        }
        return session
      },
    },
    events: {
      async createUser({ user }) {
        // #107 — SSO-provisioning deactivation net. The adapter reaches createUser
        // for an identity the signIn gate let through (or a setup edge case); the
        // consumer decides via onCreateUser whether it is anomalous (e.g. an
        // org-less non-instance-admin) and should be deactivated + audited.
        if (!opts.onCreateUser) return
        const [dbUser] = await db.select().from(users).where(eq(users.id, user.id!)).limit(1)
        if (!dbUser) return
        const decision = await opts.onCreateUser({
          id: dbUser.id,
          email: dbUser.email,
          organizationId: dbUser.organizationId,
          instanceRole: dbUser.instanceRole,
        })
        if (decision === 'deactivate') {
          await db.transaction(async (tx) => {
            await tx.update(users).set({ isActive: false }).where(eq(users.id, dbUser.id))
            await writeAuditLog(tx, {
              action: 'auth.sso_org_binding_failed',
              entityType: 'user',
              entityId: dbUser.id,
              metadata: { email: dbUser.email, reason: 'no_organization_binding' },
            })
          })
        }
      },
      async signIn({ user, account }) {
        // End the logged-out state so the new session isn't treated as a zombie.
        try {
          const { cookies } = await import('next/headers')
          ;(await cookies()).delete(LOGGED_OUT_MARKER_COOKIE)
        } catch {
          // not in a mutable-cookie context — covered by the resurrection window
        }
        await writeAuditLog(db, {
          action: 'auth.login',
          entityType: 'user',
          entityId: user.id,
          userId: user.id,
          metadata: { provider: account?.provider ?? 'credentials', ...(await telemetry()) },
        })
      },
      async signOut(message) {
        const token = 'token' in message ? (message.token as GovcoreClaims) : null
        await writeAuditLog(db, {
          action: 'auth.logout',
          entityType: 'user',
          entityId: token?.id,
          userId: token?.id,
          metadata: { ...(await telemetry()) },
        })
      },
    },
    pages: {
      signIn: opts.pages?.signIn ?? '/login',
      error: opts.pages?.error ?? '/error',
    },
  })
}

export {
  hashPassword,
  verifyPassword,
  validatePassword,
  FALLBACK_MIN_LENGTH,
  passwordPolicyFromMetadata,
  PASSWORD_POLICY_METADATA_KEY,
} from './password'
export type { PasswordPolicy, PasswordValidationResult } from './password'
export { changePassword, adminResetPassword } from './password-flows'
export type { PasswordChangeResult, PasswordResetResult } from './password-flows'
export { provisionUser } from './provisioning'
export type { ProvisionUserResult } from './provisioning'
export { checkSsoProvisioning } from './sso-guard'
export type { SsoCheckResult } from './sso-guard'
export { computeLockout, PERMISSIVE_POLICY } from './lockout'
export type { SecurityPolicy } from './lockout'
export {
  LOGGED_OUT_MARKER_COOKIE,
  LOGGED_OUT_MARKER_MAX_AGE_S,
  RESURRECTION_WINDOW_MS,
  isResurrectedSession,
} from './logout-marker'
