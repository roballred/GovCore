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
import './types'

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
}

export function createAuth(opts: CreateAuthOptions) {
  // Everything createAuth touches (adapter, credentials lookup, membership
  // resolution, login/logout audit) is identity-plane and runs before/across a
  // tenant context, so it all uses the RLS-bypassing authDb when supplied.
  const db = opts.authDb ?? opts.db
  const defaultRole = opts.defaultRole ?? 'viewer'

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

          const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
          if (!user || !user.passwordHash || !user.isActive) {
            await writeAuditLog(db, {
              action: 'auth.login_failed',
              entityType: 'user',
              organizationId: user?.organizationId,
              metadata: { email, reason: 'invalid_credentials' },
            })
            return null
          }

          const valid = await verifyPassword(password, user.passwordHash)
          if (!valid) {
            await writeAuditLog(db, {
              action: 'auth.login_failed',
              entityType: 'user',
              entityId: user.id,
              organizationId: user.organizationId,
              metadata: { email, reason: 'invalid_credentials' },
            })
            return null
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
        if (user) {
          // Initial sign-in — resolve active org/role from the DB (never trust the
          // provider's claims about our roles).
          const [dbUser] = await db.select().from(users).where(eq(users.id, user.id!)).limit(1)
          const active = await resolveActiveMembership(db, user.id!, dbUser?.lastActiveOrganizationId)
          token.id = user.id
          token.role = active?.role ?? dbUser?.role ?? defaultRole
          token.organizationId = active?.organizationId ?? dbUser?.organizationId ?? null
          token.instanceRole = dbUser?.instanceRole ?? null
          token.checkedAt = Date.now()
          // Deny the session if the resolved org is suspended/archived.
          if (!(await orgIsActive(token.organizationId))) return null
        } else if (token.id) {
          if (trigger === 'update') {
            // Explicit active-org switch — re-resolve server-authoritatively.
            const [dbUser] = await db.select().from(users).where(eq(users.id, token.id)).limit(1)
            if (dbUser) {
              const active = await resolveActiveMembership(db, token.id, dbUser.lastActiveOrganizationId)
              token.role = active?.role ?? dbUser.role ?? defaultRole
              token.organizationId = active?.organizationId ?? dbUser.organizationId ?? null
            }
            return token
          }
          // Re-validate isActive every 5 minutes so deactivation takes effect
          // without waiting for the 24h JWT to expire.
          const CHECK_INTERVAL_MS = 5 * 60 * 1000
          const lastCheck = token.checkedAt ?? 0
          if (Date.now() - lastCheck > CHECK_INTERVAL_MS) {
            const [dbUser] = await db.select().from(users).where(eq(users.id, token.id)).limit(1)
            if (!dbUser || !dbUser.isActive) return null
            // Drop the session within the interval if the org was suspended/archived.
            if (!(await orgIsActive(token.organizationId))) return null
            token.instanceRole = dbUser.instanceRole ?? null
            token.checkedAt = Date.now()
          }
        }
        return token
      },
      async session({ session, token }) {
        if (session.user) {
          session.user.id = token.id ?? ''
          session.user.role = token.role ?? defaultRole
          session.user.organizationId = token.organizationId ?? null
          session.user.instanceRole = token.instanceRole ?? null
        }
        return session
      },
    },
    events: {
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
          metadata: { provider: account?.provider ?? 'credentials' },
        })
      },
      async signOut(message) {
        const token = 'token' in message ? message.token : null
        await writeAuditLog(db, {
          action: 'auth.logout',
          entityType: 'user',
          entityId: token?.id,
          userId: token?.id,
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
export {
  LOGGED_OUT_MARKER_COOKIE,
  LOGGED_OUT_MARKER_MAX_AGE_S,
  RESURRECTION_WINDOW_MS,
  isResurrectedSession,
} from './logout-marker'
