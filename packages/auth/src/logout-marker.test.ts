import { describe, expect, it } from 'vitest'
import {
  LOGGED_OUT_MARKER_COOKIE,
  RESURRECTION_WINDOW_MS,
  isResurrectedSession,
} from './logout-marker'

// The #782 resurrection guard's whole decision lives in this pure function;
// middleware only wires it. marker values are epoch ms (string), iat is epoch s.
describe('isResurrectedSession (#782)', () => {
  const marker = 1_000_000_000_000 // epoch ms
  const markerStr = String(marker)
  const iatAt = (ms: number) => ms / 1000 // helper: epoch-ms → iat seconds

  it('is false when no logged-out marker is present', () => {
    expect(isResurrectedSession(undefined, iatAt(marker))).toBe(false)
  })

  it('fails open on a corrupt or non-positive marker (never lock the browser out)', () => {
    expect(isResurrectedSession('not-a-number', iatAt(marker))).toBe(false)
    expect(isResurrectedSession('0', iatAt(marker))).toBe(false)
    expect(isResurrectedSession('-5', iatAt(marker))).toBe(false)
  })

  it('rejects a token issued before the marker', () => {
    expect(isResurrectedSession(markerStr, iatAt(marker - 60_000))).toBe(true)
  })

  it('rejects a token issued within the race window after the marker', () => {
    expect(isResurrectedSession(markerStr, iatAt(marker + RESURRECTION_WINDOW_MS / 2))).toBe(true)
  })

  it('allows a token issued well after the race window', () => {
    expect(isResurrectedSession(markerStr, iatAt(marker + RESURRECTION_WINDOW_MS + 60_000))).toBe(
      false,
    )
  })

  it('rejects a token that has a marker but no iat (indistinguishable from pre-logout)', () => {
    expect(isResurrectedSession(markerStr, undefined)).toBe(true)
  })

  it('exposes the marker cookie name', () => {
    expect(LOGGED_OUT_MARKER_COOKIE).toBe('govcore.logged-out-at')
  })
})
