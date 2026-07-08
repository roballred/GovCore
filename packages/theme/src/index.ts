// @govcore/theme — the Tailwind preset over the base tokens + safe brand theming.
//
// The accessibility floor lives in ./base.css. Apps:
//   - add `baseTheme` to their Tailwind `presets`, and
//   - declare brand themes with `defineTheme`, which only allows overriding the
//     allowlisted brand vars and rejects values that could break out of the
//     inline <style> tag (#769).
//
// Runtime theming has two independent axes so every consumer looks and behaves
// the same:
//   - **brand** — which registered theme is active, applied via a `data-theme`
//     attribute on <html>. `themesToCss` serializes a whole registry into one
//     <style> block (default = the first theme under `:root`), so switching is a
//     single attribute flip with no refetch.
//   - **dark** — the `.dark` class on <html> (base.css defines both palettes).
// The nextkit `ThemeSelector` / `DarkModeToggle` / `ThemeInitScript` drive these.

/** Tailwind preset mapping semantic color names to the base.css HSL tokens. */
export const baseTheme = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        header: {
          DEFAULT: 'hsl(var(--header-bg))',
          foreground: 'hsl(var(--header-fg))',
          border: 'hsl(var(--header-border))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
}

/** Brand vars an app theme may override. Content/contrast tokens are NOT here. */
export const BRAND_VAR_ALLOWLIST = [
  '--primary',
  '--primary-foreground',
  '--ring',
  '--header-bg',
  '--header-fg',
  '--header-border',
  '--radius',
] as const

export type BrandVar = (typeof BRAND_VAR_ALLOWLIST)[number]

/** localStorage keys the runtime theming components share (selector, toggle, init script). */
export const THEME_STORAGE_KEY = 'govcore-theme'
export const DARK_STORAGE_KEY = 'govcore-dark-mode'

/** Swatch colors for the ThemeSelector preview card (UI-only; not serialized to CSS). */
export interface ThemePreview {
  header: string
  primary: string
  background: string
}

export interface ThemeDefinition {
  id: string
  name: string
  brandVars: Partial<Record<BrandVar, string>>
  /** One-line description shown in the ThemeSelector. */
  description?: string
  /** Preview swatch colors for the ThemeSelector card. */
  preview?: ThemePreview
  /** Selecting this theme also turns on dark mode (e.g. an inherently dark brand). */
  dark?: boolean
}

function sanitizeValue(value: string): string {
  // Reject anything that could close the property/style context (#769).
  if (/[;{}<>]/.test(value)) {
    throw new Error('defineTheme: illegal characters in a brand-var value')
  }
  return value.trim()
}

/**
 * Declare a brand theme. Only allowlisted brand vars are accepted (anything else
 * throws), and each value is sanitized so a tenant-supplied color cannot break
 * out of the inline `<style>` tag. `description`/`preview`/`dark` are optional
 * metadata for the ThemeSelector and are never serialized into CSS.
 */
export function defineTheme(def: {
  id: string
  name: string
  brandVars: Record<string, string>
  description?: string
  preview?: ThemePreview
  dark?: boolean
}): ThemeDefinition {
  const safe: Partial<Record<BrandVar, string>> = {}
  for (const [key, value] of Object.entries(def.brandVars)) {
    if (!(BRAND_VAR_ALLOWLIST as readonly string[]).includes(key)) {
      throw new Error(`defineTheme: brand var "${key}" is not in the allowlist`)
    }
    safe[key as BrandVar] = sanitizeValue(value)
  }
  return {
    id: def.id,
    name: def.name,
    brandVars: safe,
    description: def.description,
    preview: def.preview,
    dark: def.dark,
  }
}

/** Serialize a theme's brand vars to a safe inline-style string (for a <style> block). */
export function themeToCss(theme: ThemeDefinition, selector = ':root'): string {
  const body = Object.entries(theme.brandVars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n')
  return `${selector} {\n${body}\n}`
}

/**
 * Serialize a whole theme registry into one stylesheet: each theme scoped to
 * `:root[data-theme="<id>"]`, and the first (canonical) theme also emitted under
 * bare `:root` so it is the default before any `data-theme` is set. Drop the
 * result in a single `<style>` (see nextkit `ThemeStyle`) and switch brands by
 * flipping the `data-theme` attribute — no refetch.
 */
export function themesToCss(themes: ThemeDefinition[]): string {
  if (themes.length === 0) return ''
  const blocks = [themeToCss(themes[0], ':root')]
  for (const theme of themes) {
    blocks.push(themeToCss(theme, `:root[data-theme="${theme.id}"]`))
  }
  return blocks.join('\n\n')
}

// ── Starter registry ─────────────────────────────────────────────────────────
//
// A shared, ready-to-use theme set so every consumer offers the *same* themes
// (the "one brand system" line) instead of each app hand-rolling its own. Apps
// pass `starterThemes` to ThemeStyle/ThemeSelector, or define their own with
// `defineTheme`. Brand themes only touch allowlisted accent/header vars — the
// surface/contrast tokens stay on the base.css AA floor.

/** Canonical civic brand — the base.css defaults, named so it appears in the selector. */
export const govcoreTheme = defineTheme({
  id: 'govcore',
  name: 'GovCore',
  description: 'Clean, professional civic blue. WCAG AA.',
  preview: { header: '#152c5c', primary: '#1a4fba', background: '#f8f9fb' },
  brandVars: {},
})

/** A dark-header, purple-accent alternative reminiscent of ServiceNow. */
export const serviceNowTheme = defineTheme({
  id: 'servicenow',
  name: 'ServiceNow',
  description: 'Dark header with purple accents. Familiar to ServiceNow users.',
  preview: { header: '#1c2433', primary: '#6b3fa0', background: '#f7f7f7' },
  dark: true,
  brandVars: {
    '--primary': '270 44% 44%',
    '--primary-foreground': '0 0% 98%',
    '--ring': '270 44% 44%',
    '--radius': '0.25rem',
    '--header-bg': '222 33% 17%',
    '--header-fg': '210 20% 90%',
    '--header-border': '222 33% 23%',
  },
})

/** The default shared registry. `starterThemes[0]` is the canonical default. */
export const starterThemes: ThemeDefinition[] = [govcoreTheme, serviceNowTheme]
