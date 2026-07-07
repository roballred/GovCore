# @govcore/middleware

## 0.1.2

### Patch Changes

- Updated dependencies [f45843c]
  - @govcore/auth@0.3.0

## 0.1.1

### Patch Changes

- Updated dependencies [d255afc]
- Updated dependencies [ceede7a]
  - @govcore/auth@0.2.0

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

- Updated dependencies [ca7cadb]
- Updated dependencies [18bed9e]
  - @govcore/auth@0.1.0
