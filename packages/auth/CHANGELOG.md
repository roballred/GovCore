# @govcore/auth

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
