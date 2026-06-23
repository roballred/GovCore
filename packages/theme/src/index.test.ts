import { describe, expect, it } from 'vitest'
import { BRAND_VAR_ALLOWLIST, defineTheme, themeToCss } from './index'

describe('defineTheme — brand-var allowlist (#769)', () => {
  it('accepts allowlisted brand vars and trims values', () => {
    const theme = defineTheme({
      id: 'acme',
      name: 'Acme',
      brandVars: { '--primary': '  220 90% 56%  ', '--radius': '0.5rem' },
    })
    expect(theme).toMatchObject({ id: 'acme', name: 'Acme' })
    expect(theme.brandVars['--primary']).toBe('220 90% 56%')
    expect(theme.brandVars['--radius']).toBe('0.5rem')
  })

  it('rejects a var that is not on the allowlist', () => {
    expect(() =>
      defineTheme({ id: 'x', name: 'X', brandVars: { '--background': '0 0% 100%' } }),
    ).toThrow(/not in the allowlist/)
  })

  it('keeps content/contrast tokens off the allowlist', () => {
    expect(BRAND_VAR_ALLOWLIST).not.toContain('--background')
    expect(BRAND_VAR_ALLOWLIST).not.toContain('--foreground')
  })
})

describe('defineTheme — style-breakout sanitizer (#769)', () => {
  it.each([
    ['semicolon', '220 90% 56%; } body{display:none'],
    ['close brace', '220 90% 56% }'],
    ['open brace', '220 90% 56% {'],
    ['style-tag close', '</style><script>alert(1)</script>'],
    ['angle bracket', 'red>'],
  ])('rejects a value containing a %s', (_label, value) => {
    expect(() =>
      defineTheme({ id: 'evil', name: 'Evil', brandVars: { '--primary': value } }),
    ).toThrow(/illegal characters/)
  })
})

describe('themeToCss', () => {
  it('serializes brand vars under :root by default', () => {
    const css = themeToCss(defineTheme({ id: 'a', name: 'A', brandVars: { '--primary': '1 2% 3%' } }))
    expect(css).toContain(':root {')
    expect(css).toContain('  --primary: 1 2% 3%;')
  })

  it('honors a custom selector', () => {
    const css = themeToCss(
      defineTheme({ id: 'a', name: 'A', brandVars: { '--ring': '1 2% 3%' } }),
      '[data-theme="a"]',
    )
    expect(css.startsWith('[data-theme="a"] {')).toBe(true)
  })
})
