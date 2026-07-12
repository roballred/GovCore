---
"@govcore/auth": minor
---

createAuth: per-org security-policy + SSO-lifecycle hooks so a hardened consumer can adopt it without regressing (#107).

`createAuth` was thinner than the inline auth of consumer-zero (GovEA), so adopting it meant dropping account lockout, per-org session timeout / password expiry, the SSO deactivation net, and request-telemetry audit. New options close the gap; all are optional and default to today's behavior.

- **`securityPolicy?: (orgId) => SecurityPolicy`** — resolved in the credentials flow to enforce **account lockout** (failure counting on `users.failed_login_attempts`; lock at `lockoutThreshold`; auto-clear after `lockoutDurationMinutes`; the lock is checked **before** the password compare — NIST 800-63B §5.2.2 timing-oracle defense), and in the `jwt` callback to **snapshot `sessionTimeoutMinutes` / `passwordExpiryDays` / `lastPasswordChangedAt` onto the token + session** so an edge middleware (no DB) can make redirect decisions. The `jwt` callback also enforces the per-org session timeout against the session-origin `issuedAt`.
- **`authContext?: () => { ip?, userAgent? }`** — merged into login/logout audit metadata (proxy-aware telemetry).
- **`onCreateUser?`** — runs after the adapter creates a user; returning `'deactivate'` deactivates an anomalous org-less identity and writes an `auth.sso_org_binding_failed` audit (the SSO deactivation net).
- Distinct lockout audit labels: `auth.login_blocked_locked` / `auth.login_failed_locked` alongside `auth.login_failed`.
- Exports the pure, unit-tested **`computeLockout`** transition and the `SecurityPolicy` type (+ `PERMISSIVE_POLICY`).

Additive: with no `securityPolicy` supplied, lockout and timeout are disabled (`PERMISSIVE_POLICY`) and behavior is unchanged. The security-policy fields are added to the opt-in `@govcore/auth/next-auth` augmentation. Unblocks GovEA #894 / #896's `createAuth` adoption with parity to its shipped auth.
