# @govcore/auth

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
