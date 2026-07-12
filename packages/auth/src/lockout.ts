// Pure security-policy types + lockout math (#107). No next-auth / DB imports, so
// it is trivially unit-testable and safe to import anywhere. `createAuth` (in
// ./index) consumes these and re-exports them as part of the package's API.

/**
 * Per-org security policy. Consumers resolve it from their own settings;
 * `createAuth` enforces lockout in the credentials flow and snapshots the timeout
 * / expiry fields onto the JWT + session.
 */
export interface SecurityPolicy {
  /** Lock the account after this many consecutive failures. `0` disables lockout. */
  lockoutThreshold: number
  /** Minutes a lock lasts before it self-clears. */
  lockoutDurationMinutes: number
  /** Max session age in minutes before re-login is forced. `0` disables. */
  sessionTimeoutMinutes: number
  /** Days before a password must be rotated. `0` disables. Surfaced on the session. */
  passwordExpiryDays: number
}

/** No lockout, no timeout — the behavior when no `securityPolicy` is supplied. */
export const PERMISSIVE_POLICY: SecurityPolicy = {
  lockoutThreshold: 0,
  lockoutDurationMinutes: 0,
  sessionTimeoutMinutes: 0,
  passwordExpiryDays: 0,
}

/**
 * Pure lockout transition: given the current failure count and the org policy,
 * compute the next `failed_login_attempts` + `lockout_until` after one more failed
 * attempt. `lockoutThreshold: 0` disables locking (per-org opt-out). `now` is
 * injectable for tests.
 */
export function computeLockout(
  failedLoginAttempts: number,
  policy: Pick<SecurityPolicy, 'lockoutThreshold' | 'lockoutDurationMinutes'>,
  now: number = Date.now(),
): { failedLoginAttempts: number; lockoutUntil: Date | null } {
  const attempts = failedLoginAttempts + 1
  const shouldLock = policy.lockoutThreshold > 0 && attempts >= policy.lockoutThreshold
  return {
    failedLoginAttempts: attempts,
    lockoutUntil: shouldLock ? new Date(now + policy.lockoutDurationMinutes * 60_000) : null,
  }
}
