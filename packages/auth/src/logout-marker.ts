// @govcore/auth/logout-marker — post-logout session-resurrection guard.
//
// With JWT rolling sessions, a request in flight when the user signs out carries
// a still-valid cookie; Auth.js rolls it onto that response, landing AFTER
// logout's deletion and re-setting a live session. So logout drops a timestamped
// marker cookie, and middleware rejects (and deletes) any token issued before
// the marker. A resurrected cookie can land in the jar but can never be used.
//
// Edge-safe: pure arithmetic, no DB, no Node built-ins.

export const LOGGED_OUT_MARKER_COOKIE = 'govcore.logged-out-at'

/** Must be ≥ the session maxAge so every pre-logout token stays rejectable. */
export const LOGGED_OUT_MARKER_MAX_AGE_S = 60 * 60 * 24

/**
 * Tokens issued up to this long AFTER the marker are still rejected: a racing
 * roll can be processed well after the logout request. A genuine re-login is not
 * subject to this — the signIn event deletes the marker — so it only bites in the
 * degraded case where that deletion failed, and self-heals after 60s.
 */
export const RESURRECTION_WINDOW_MS = 60_000

/**
 * True when a token presented alongside a logged-out marker must be treated as
 * resurrected (issued before, or within the race window after, the logout).
 *
 * @param markerValue raw cookie value (epoch ms as string), if present
 * @param issuedAtSeconds the token's `iat` claim (epoch seconds)
 */
export function isResurrectedSession(
  markerValue: string | undefined,
  issuedAtSeconds: number | undefined,
): boolean {
  if (!markerValue) return false

  const loggedOutAtMs = Number(markerValue)
  // Corrupt marker: fail open rather than lock the browser out for the marker's life.
  if (!Number.isFinite(loggedOutAtMs) || loggedOutAtMs <= 0) return false

  // A token with no iat alongside a marker is indistinguishable from a
  // pre-logout token — reject it.
  if (issuedAtSeconds === undefined) return true

  return issuedAtSeconds * 1000 < loggedOutAtMs + RESURRECTION_WINDOW_MS
}
