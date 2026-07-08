'use client'

// @govcore/nextkit/theming — the runtime theming controls (the one client corner
// of nextkit; the rest of the package is RSC-only). DarkModeToggle flips the
// `.dark` class; ThemeSelector flips the `data-theme` brand attribute. Both
// persist to localStorage under the shared @govcore/theme keys so ThemeInitScript
// (rendered in <head>) can restore the choice before first paint (no FOUC). State
// is read through useSyncExternalStore so it stays correct across tabs and never
// setStates in an effect.

import { useEffect, useSyncExternalStore } from 'react'
import {
  DARK_STORAGE_KEY,
  THEME_STORAGE_KEY,
  type ThemeDefinition,
} from '@govcore/theme'

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

// A localStorage-backed external store. Writes dispatch a synthetic `storage`
// event so the same tab re-reads (native storage events fire cross-tab only).
function subscribe(cb: () => void): () => void {
  window.addEventListener('storage', cb)
  return () => window.removeEventListener('storage', cb)
}

function writeStored(key: string, value: string): void {
  localStorage.setItem(key, value)
  window.dispatchEvent(new StorageEvent('storage', { key }))
}

// ── Dark-mode toggle ─────────────────────────────────────────────────────────

function darkSnapshot(): boolean {
  const stored = localStorage.getItem(DARK_STORAGE_KEY)
  return stored === 'dark' || (stored === null && window.matchMedia('(prefers-color-scheme: dark)').matches)
}

/**
 * A header-styled light/dark switch. Persists to the shared dark key and toggles
 * the `.dark` class on <html>. Style it to the header by default; pass
 * `className` to override.
 */
export function DarkModeToggle({ className }: { className?: string }) {
  const dark = useSyncExternalStore(subscribe, darkSnapshot, () => false)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  return (
    <button
      type="button"
      onClick={() => writeStored(DARK_STORAGE_KEY, dark ? 'light' : 'dark')}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={dark}
      className={cx(
        'rounded-md p-1.5 text-header-foreground/70 transition-colors hover:bg-white/10 hover:text-header-foreground',
        className,
      )}
    >
      {dark ? (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364-.707.707M6.343 17.657l-.707.707m12.728 0-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
        </svg>
      ) : (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  )
}

// ── Brand theme selector ─────────────────────────────────────────────────────

function themeSnapshot(fallback: string): () => string {
  return () => localStorage.getItem(THEME_STORAGE_KEY) ?? fallback
}

/**
 * Preview-card picker over a theme registry (e.g. @govcore/theme's
 * `starterThemes`). Selecting a theme flips `data-theme` on <html>, persists it,
 * and — if the theme declares `dark` — turns dark mode on. Self-contained via
 * localStorage; pass `onChange` to also persist server-side (e.g. per-org).
 */
export function ThemeSelector({
  themes,
  onChange,
}: {
  themes: ThemeDefinition[]
  onChange?: (themeId: string) => void
}) {
  const active = useSyncExternalStore(subscribe, themeSnapshot(themes[0]?.id ?? ''), () => themes[0]?.id ?? '')

  function select(theme: ThemeDefinition) {
    document.documentElement.setAttribute('data-theme', theme.id)
    writeStored(THEME_STORAGE_KEY, theme.id)
    if (theme.dark !== undefined) writeStored(DARK_STORAGE_KEY, theme.dark ? 'dark' : 'light')
    onChange?.(theme.id)
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {themes.map((theme) => {
        const isActive = theme.id === active
        const preview = theme.preview
        return (
          <button
            key={theme.id}
            type="button"
            onClick={() => select(theme)}
            aria-pressed={isActive}
            className={cx(
              'w-full overflow-hidden rounded-lg border-2 text-left transition-all hover:shadow-md',
              isActive ? 'border-primary shadow-sm' : 'border-transparent hover:border-border',
            )}
          >
            {preview ? (
              <div className="flex h-20 flex-col">
                <div className="flex h-7 items-center gap-1.5 px-3" style={{ backgroundColor: preview.header }}>
                  <span className="h-2 w-2 rounded-full opacity-70" style={{ backgroundColor: preview.primary }} />
                  <span className="h-1.5 w-10 rounded-full opacity-40" style={{ backgroundColor: preview.primary }} />
                </div>
                <div className="flex-1" style={{ backgroundColor: preview.background }} />
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-2 border-t border-border bg-card px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{theme.name}</p>
                {theme.description ? (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{theme.description}</p>
                ) : null}
              </div>
              {isActive ? (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary" aria-hidden="true">
                  <svg className="h-3 w-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
              ) : null}
            </div>
          </button>
        )
      })}
    </div>
  )
}
