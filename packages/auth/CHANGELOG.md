# @govcore/auth

## 0.9.0

### Minor Changes

- 792ec57: Expose `provisionUser` via an import-light `@govcore/auth/provisioning` subpath (#127)

  `provisionUser` was only reachable from the main entry, which also exports `createAuth` → pulls `next-auth` → imports bare `next/server`, so any vitest (node env) suite that loaded a module importing `provisionUser` failed to resolve `next/server`. The new `@govcore/auth/provisioning` subpath re-exports the same, already import-light `provisioning.ts` (schema/audit/tenancy/password only) with no next-auth in its graph — the same pattern as `@govcore/auth/password-flows`. The main-entry re-export is unchanged for app callers.

## 0.8.1

### Patch Changes

- Updated dependencies [0ba9eb4]
  - @govcore/tenancy@0.5.0

## 0.8.0

### Minor Changes

- e3b0b97: Operator-plane mutations now accept optional audit context (#121)

  `createOrganization`, `renameOrganization`, `updateUserAdministration` (`@govcore/tenancy`) and `provisionUser` (`@govcore/auth`) gain two optional, additive fields — `auditMetadata?: Record<string, unknown>` and `reason?: string | null` — that a consumer can use to record incident-review context (an instance console's source IP + user-agent, and the operator's stated reason) on the audit event. Both are composed into the event's `metadata` (`reason` normalized to `metadata.reason`) via the new `composeAuditMetadata` helper exported from `@govcore/audit`. Callers that pass nothing are unaffected: `metadata` stays `null`, exactly as before.

  This unblocks consumers adopting the console mutations without losing audit fidelity they had in their hand-rolled versions (GovEA #895 / #720).

### Patch Changes

- Updated dependencies [e3b0b97]
  - @govcore/audit@0.2.0
  - @govcore/tenancy@0.4.0

## 0.7.0

### Minor Changes

- 784e86b: Expose `changePassword` / `adminResetPassword` (+ `PasswordPolicy`) via a new **import-light `@govcore/auth/password-flows` subpath**. The flows themselves never touched `next-auth`, but living only on the main entry meant importing them pulled `createAuth` → `next-auth` → `next/server`, breaking consumers' vitest suites (node env). Import from `@govcore/auth/password-flows` to get the flows without that graph. The main `.` entry still re-exports them (non-breaking).

## 0.6.0

### Minor Changes

- 52511a9: createAuth: per-org security-policy + SSO-lifecycle hooks so a hardened consumer can adopt it without regressing (#107).

  `createAuth` was thinner than the inline auth of consumer-zero (GovEA), so adopting it meant dropping account lockout, per-org session timeout / password expiry, the SSO deactivation net, and request-telemetry audit. New options close the gap; all are optional and default to today's behavior.

  - **`securityPolicy?: (orgId) => SecurityPolicy`** — resolved in the credentials flow to enforce **account lockout** (failure counting on `users.failed_login_attempts`; lock at `lockoutThreshold`; auto-clear after `lockoutDurationMinutes`; the lock is checked **before** the password compare — NIST 800-63B §5.2.2 timing-oracle defense), and in the `jwt` callback to **snapshot `sessionTimeoutMinutes` / `passwordExpiryDays` / `lastPasswordChangedAt` onto the token + session** so an edge middleware (no DB) can make redirect decisions. The `jwt` callback also enforces the per-org session timeout against the session-origin `issuedAt`.
  - **`authContext?: () => { ip?, userAgent? }`** — merged into login/logout audit metadata (proxy-aware telemetry).
  - **`onCreateUser?`** — runs after the adapter creates a user; returning `'deactivate'` deactivates an anomalous org-less identity and writes an `auth.sso_org_binding_failed` audit (the SSO deactivation net).
  - Distinct lockout audit labels: `auth.login_blocked_locked` / `auth.login_failed_locked` alongside `auth.login_failed`.
  - Exports the pure, unit-tested **`computeLockout`** transition and the `SecurityPolicy` type (+ `PERMISSIVE_POLICY`).

  Additive: with no `securityPolicy` supplied, lockout and timeout are disabled (`PERMISSIVE_POLICY`) and behavior is unchanged. The security-policy fields are added to the opt-in `@govcore/auth/next-auth` augmentation. Unblocks GovEA #894 / #896's `createAuth` adoption with parity to its shipped auth.

## 0.5.0

### Minor Changes

- c9cec04: auth: stop shipping a global `next-auth` augmentation; the consumer owns its session/role types (#108).

  `@govcore/auth`'s entry side-effect-imported a `declare module 'next-auth'` that stamped `session.user.role: string` (and a `@auth/core/jwt` `role?: string`) onto **every** consumer's compilation. A consumer that types `role` as its own union (not bare `string`) got its session augmentation overridden — `session.user.role` resolved to `string` and every typed-role call site failed. Worse, `@govcore/setup` imported `@govcore/auth` for a single type, so an app that only wanted `provisionRuntimeRole` inherited the augmentation too.

  - **`@govcore/auth`** no longer imports `./types` from its entry. `createAuth`'s callbacks type the claims they stamp via a **local** cast, so the package compiles without globally augmenting anyone. The augmentation is now an **opt-in** subpath: a single-role app that wants a ready-made session shape does `import '@govcore/auth/next-auth'`; an app with its own role type declares its own `next-auth` augmentation and skips it. No runtime change.
  - **`@govcore/setup`** imports `PasswordPolicy`/`hashPassword`/`validatePassword` from the leaf `@govcore/auth/password` instead of the package entry, so it no longer drags the augmentation.
  - **`examples/minimal-app`** now declares its own `next-auth` augmentation typing `role` as its `'admin' | 'member' | 'viewer'` union — the canary proves a typed-role consumer compiles against `createAuth`.

  **Migration:** a consumer relying on the old implicit `session.user.role: string` either adds `import '@govcore/auth/next-auth'` once (side-effect) or declares its own `next-auth` module augmentation (recommended — lets you type `role` as your role union).

## 0.4.1

### Patch Changes

- Updated dependencies [f993e42]
  - @govcore/schema@0.4.0
  - @govcore/tenancy@0.3.1
  - @govcore/audit@0.1.4

## 0.4.0

### Minor Changes

- c9ae7c1: Organization lifecycle: suspend / reinstate / archive, enforced (#69).

  Lifecycle was unmodeled — the only escape hatch was `organizations.metadata`, which nothing enforced. It's now first-class and gated at the platform layer.

  - **`@govcore/schema`** — `organizations` gains `status` (`active | suspended | archived`, default `active`) plus `status_reason` / `status_changed_at` / `status_changed_by` (migration `0003`). Exports `ORGANIZATION_STATUSES`, the `OrganizationStatus` type, and the pure `isOrganizationActive(status)`. `metadata` is documented as the app's extension bag only — lifecycle no longer lives there.
  - **`@govcore/tenancy`** — `suspendOrganization` (reason required), `reinstateOrganization` (back to `active`, clears the reason), and `archiveOrganization` (soft-delete; data retained — a hard delete is a `@govcore/backup` export-then-purge concern). Each stamps who/when and audits `platform.org.suspend` / `reinstate` / `archive`.
  - **`@govcore/server`** — `createTenantActions` now gates on org status: a suspended/archived org runs **no** tenant transaction regardless of the actor's permissions. New optional `onOrgInactive(status)` hook (default throws `Organization is <status>`) so the app can route to a dedicated page. `organizations` isn't RLS-bound, so the check reads on the runtime pool.
  - **`@govcore/auth`** — `createAuth` denies a session whose resolved active org is suspended/archived: blocked at login and dropped within the 5-minute re-validation window.

  Additive — with the default `active` status, existing consumers see no behavior change. Not yet modeled: multi-org "skip the suspended org, resolve the next active membership" (today a session bound to a suspended org is denied rather than re-homed).

### Patch Changes

- Updated dependencies [c9ae7c1]
  - @govcore/schema@0.3.0
  - @govcore/tenancy@0.3.0
  - @govcore/audit@0.1.3

## 0.3.1

### Patch Changes

- fbd5dc1: Ship compiled builds — retire source-first packaging (#71, closes #56).

  Every package published `main: ./src/index.ts`, which pushed core's build internals onto consumers: internal type deps leaked (a consumer needed `@types/bcryptjs` just to typecheck `@govcore/auth`, #56), every Next.js app had to list all 14 packages in `transpilePackages`, and non-Next/Node consumers couldn't consume the TS source at all.

  Each package now builds with **tsup** to ESM + `.d.ts` + sourcemaps in `dist/`, with `exports`/`main`/`types` pointing at the compiled output and `files` limited to what ships (`dist`, plus `migrations/` for schema and `base.css` for theme). Intra-package modules are bundled; `dependencies`/`peerDependencies` (the other `@govcore/*` packages, drizzle, react, …) stay external. Multi-entry packages keep their subpaths compiled — `@govcore/auth/password`, `@govcore/content/screens`, `@govcore/schema/migrate`; the `govcore-migrate` bin still resolves `../migrations` from `dist/`.

  Non-breaking: a consumer that keeps `transpilePackages` for these keeps working (transpiling already-compiled ESM is a no-op) — but no longer needs it, or any of core's internal `@types`. Proven by the canary (`examples/minimal-app`) now building with an empty `next.config`, and by a CI build step so both the canary and the smoke resolve the compiled `dist/` rather than source.

- Updated dependencies [fbd5dc1]
  - @govcore/schema@0.2.1
  - @govcore/audit@0.1.2
  - @govcore/tenancy@0.2.1

## 0.3.0

### Minor Changes

- f45843c: The operator/identity plane: fix the two-role login wall and name the operator seam (#57).

  `createAuth` gains an `authDb` option. Under the two-role split the runtime `db` connects as a non-owner, so `govcore.users`/memberships are FORCE-RLS-filtered by the `app.current_org` GUC — which cannot exist before a session does, so a credentials login finds zero rows and fails with `CredentialsSignin`. `authDb` is the identity-plane pool (a superuser or `BYPASSRLS` role — FORCE binds even the owner) that createAuth uses for the adapter, credentials lookup, SSO-provisioning check, membership resolution, and login/logout audit. Defaults to `db`, so single-role/dev setups are unchanged; two-role consumers stop reinventing an `authDb`/`platformDb` convention to get past login.

  `@govcore/server` gains `createOperatorActions` — the operator-plane counterpart to `createTenantActions`. Where `tenantAction` runs on the runtime pool, sets the org GUC, and gates by an RBAC permission, `operatorAction` runs on the privileged pool, sets **no** org GUC (cross-org by design), and gates by `instanceRole` (default `instance_admin`, exported as `INSTANCE_ADMIN_ROLE`). It hands the handler the privileged db plus an audit writer pre-bound to the operator — so a consumer's ad-hoc `platformDb.select(...)` becomes a named, instance-admin-gated seam the gate can't be forgotten on. Composes the #63 console mutations (`createOrganization`, `updateUserAdministration`, …), which manage their own transactions.

## 0.2.0

### Minor Changes

- d255afc: Operator-plane console mutations (#63). The org/user administration flows behind an instance console were rebuilt by every consumer (GovEA `actions/instance.ts`, GovCRM `lib/platform.ts`), and the user path is exactly where they diverged. Promote the mutations to core, composing the membership invariants from #65 so the guard and write-sync are identical everywhere.

  `@govcore/tenancy` gains `createOrganization` (auto-slug via the new exported `slugify`; a duplicate slug returns a typed `slug-taken`), `renameOrganization` (name-only; audited before/after), and `updateUserAdministration` — the guard-heavy one: it enforces the last-active-admin invariant via `assertNotLastActiveAdmin` (inside the transaction) and an own-instance-admin lockout, updates the `users` row, and keeps the membership in lockstep via `upsertMembership`. All audited as `platform.org.*` / `platform.user.update` and generic over the app's admin role name; tenancy now depends on `@govcore/audit`.

  `@govcore/auth` gains `provisionUser` — create a user with an initial password + primary membership. It lives here (not tenancy) because it hashes: validates against the policy, hashes, inserts, writes the membership through tenancy's `upsertMembership`, and audits `platform.user.create` without ever putting the password in the payload; a duplicate email returns a typed `email-taken`.

  `@govcore/schema` gains `isUniqueViolation(err)` — a pure, edge-safe SQLSTATE-23505 predicate so operator flows turn a duplicate slug/email into a typed result instead of a 500.

  All framework-agnostic (no FormData/redirect/revalidate — the consumer keeps the thin `'use server'` wrapper and the `instance_admin` gate) and returning typed results rather than throwing.

- ceede7a: Password change + reset flows (#66). The policy validator and hashing already lived in `@govcore/auth`; the _flows_ that compose them with the user row, audit, and lockout state were rebuilt by every consumer (GovEA has a change action; GovCRM shipped neither, leaving an account-recovery hole). Added `changePassword(db, { userId, currentPassword, newPassword, policy? })` — always verifies the current password, audits a wrong one as `auth.password_change_failed`, validates the new password against the policy, and rejects reuse of the current one — and `adminResetPassword(db, { userId, newPassword, actorUserId, policy? })` for operator-initiated resets that require no current password and are audited as `auth.password_reset` attributed to the operator. Both own the write over `@govcore/schema.users`, clear lockout state on success, and never put a password in an audit payload. Each returns a typed result (`{ ok }` with a stable `reason` code) rather than throwing. Also added `passwordPolicyFromMetadata(metadata)` + `PASSWORD_POLICY_METADATA_KEY` — a pure, defensive resolver for a per-org `PasswordPolicy` stashed in `organizations.metadata` (GovCore models no security-settings column; formalizing org settings is tracked in #69).

### Patch Changes

- Updated dependencies [d255afc]
- Updated dependencies [a379a16]
  - @govcore/tenancy@0.2.0
  - @govcore/schema@0.2.0
  - @govcore/audit@0.1.1

## 0.1.0

### Minor Changes

- ca7cadb: Phase 3 — route protection and identity.

  `@govcore/auth`: `createAuth` factory wrapping Auth.js (NextAuth v5) — injected
  OIDC providers + local credentials (bcrypt), the Drizzle adapter over
  `@govcore/schema`, the invite-based SSO provisioning guard, JWT/session callbacks
  that stamp the active org/role from the membership model, login/logout audit, and
  the resurrection-guard marker. Plus `hashPassword`/`verifyPassword`/`validatePassword`
  and an edge-safe `./logout-marker` subpath. GovEA's product-specific per-org
  policy (lockout/session-timeout/password-expiry) is intentionally not included.

  `@govcore/middleware`: edge-safe `createMiddleware` factory — read-only `getToken`
  decode (never writes cookies, ADR-0003), the #782 post-logout resurrection guard,
  the #807 bind-address-safe redirect, and configurable public/instance-only/
  maintenance gating, plus `defaultMatcher`.

### Patch Changes

- 18bed9e: Add an edge-/Node-safe `./password` subpath export (bcrypt hash/verify +
  `validatePassword`) so callers can hash passwords without importing the full
  NextAuth-backed entrypoint (e.g. seed scripts).
- Updated dependencies
- Updated dependencies [f2f3743]
  - @govcore/audit@0.1.0
  - @govcore/tenancy@0.1.0
  - @govcore/schema@0.1.0
