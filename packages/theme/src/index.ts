// @govcore/theme — the Tailwind preset over the base tokens + safe brand theming.
//
// The accessibility floor lives in ./base.css. Apps:
//   - add `baseTheme` to their Tailwind `presets`, and
//   - declare brand themes with `defineTheme`, which only allows overriding the
//     allowlisted brand vars and rejects values that could break out of the
//     inline <style> tag (#769).

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
  '--radius',
] as const

export type BrandVar = (typeof BRAND_VAR_ALLOWLIST)[number]

export interface ThemeDefinition {
  id: string
  name: string
  brandVars: Partial<Record<BrandVar, string>>
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
 * out of the inline `<style>` tag.
 */
export function defineTheme(def: {
  id: string
  name: string
  brandVars: Record<string, string>
}): ThemeDefinition {
  const safe: Partial<Record<BrandVar, string>> = {}
  for (const [key, value] of Object.entries(def.brandVars)) {
    if (!(BRAND_VAR_ALLOWLIST as readonly string[]).includes(key)) {
      throw new Error(`defineTheme: brand var "${key}" is not in the allowlist`)
    }
    safe[key as BrandVar] = sanitizeValue(value)
  }
  return { id: def.id, name: def.name, brandVars: safe }
}

/** Serialize a theme's brand vars to a safe inline-style string (for a <style> block). */
export function themeToCss(theme: ThemeDefinition, selector = ':root'): string {
  const body = Object.entries(theme.brandVars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n')
  return `${selector} {\n${body}\n}`
}
