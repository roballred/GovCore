// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import axe from 'axe-core'
import { AppShell, type NavGroup } from './index'

const nav = [
  { href: '/dashboard', label: 'Dashboard', active: true },
  { href: '/reports', label: 'Reports' },
]

const groups: NavGroup[] = [
  { label: 'Portfolio', defaultOpen: true, items: [{ href: '/applications', label: 'Applications' }] },
]

/** Render into a real document so axe can walk the tree. */
function mount(markup: string): HTMLElement {
  document.body.innerHTML = markup
  return document.body
}

/**
 * axe in jsdom runs the structural rules this shell is responsible for
 * (landmarks, region, bypass, aria). Rules that need real layout/painting —
 * color-contrast above all — cannot run here; the theme's WCAG-AA floor and a
 * consumer's own browser-based axe gate cover those.
 */
async function axeViolations(markup: string, runOnly?: string[]) {
  mount(markup)
  const results = await axe.run(document.body, {
    ...(runOnly ? { runOnly } : {}),
    rules: { 'color-contrast': { enabled: false } },
  })
  return results.violations
}

describe('AppShell width', () => {
  it('is a centered reading-width column by default', () => {
    const html = renderToStaticMarkup(<AppShell title="X" nav={nav}>body</AppShell>)
    expect(html).toContain('max-w-6xl')
  })

  it('runs full width when fluid, so dense content is not clipped', () => {
    const html = renderToStaticMarkup(<AppShell title="X" nav={nav} width="fluid">body</AppShell>)
    expect(html).not.toContain('max-w-6xl')
    expect(html).toContain('w-full')
  })
})

describe('AppShell landmarks + skip-link (#102)', () => {
  it('emits a skip-link pointing at the main landmark', () => {
    const html = renderToStaticMarkup(<AppShell title="X" nav={nav}>body</AppShell>)
    expect(html).toMatch(/<a[^>]+href="#main-content"[^>]*>Skip to main content<\/a>/)
    expect(html).toContain('<main id="main-content"')
    // hidden until focused, then revealed
    expect(html).toMatch(/href="#main-content"[^>]*class="[^"]*sr-only[^"]*focus:not-sr-only/)
  })

  it('honors a custom mainId so the skip-link still targets main', () => {
    const html = renderToStaticMarkup(
      <AppShell title="X" nav={nav} mainId="content" skipLinkLabel="Skip nav">body</AppShell>,
    )
    expect(html).toMatch(/href="#content"[^>]*>Skip nav</)
    expect(html).toContain('<main id="content"')
  })

  it('wraps content in banner / navigation / main landmarks', () => {
    const html = renderToStaticMarkup(<AppShell title="X" nav={nav}>body</AppShell>)
    expect(html).toContain('<header')
    expect(html).toMatch(/<nav[^>]+aria-label="Primary"/)
    expect(html).toContain('<main')
  })

  it('passes axe A/AA structural rules (flat nav)', async () => {
    const violations = await axeViolations(
      renderToStaticMarkup(<AppShell title="X" nav={nav} user={{ name: 'A' }}>body</AppShell>),
      ['wcag2a', 'wcag2aa'],
    )
    expect(violations.map((v) => v.id)).toEqual([])
  })

  it('passes axe A/AA structural rules (grouped nav + search + actions)', async () => {
    const violations = await axeViolations(
      renderToStaticMarkup(
        <AppShell
          title="X"
          nav={groups}
          width="fluid"
          search={<input type="search" aria-label="Search" />}
          actions={<button type="button">Sign out</button>}
        >
          body
        </AppShell>,
      ),
      ['wcag2a', 'wcag2aa'],
    )
    expect(violations.map((v) => v.id)).toEqual([])
  })

  it('has no unlandmarked content (axe region rule)', async () => {
    const violations = await axeViolations(
      renderToStaticMarkup(<AppShell title="X" nav={nav}>body</AppShell>),
      ['cat.keyboard', 'best-practice'],
    )
    expect(violations.map((v) => v.id)).not.toContain('region')
  })
})

describe('AppShell print + header slots (#102)', () => {
  it('hides its own chrome when printing, leaving the content', () => {
    const html = renderToStaticMarkup(<AppShell title="X" nav={nav}>body</AppShell>)
    // header and sidebar drop out; <main> is never print:hidden
    expect(html.match(/print:hidden/g)?.length).toBe(2)
    expect(html).toMatch(/<header[^>]*class="[^"]*print:hidden/)
    expect(html).not.toMatch(/<main[^>]*class="[^"]*print:hidden/)
  })

  it('renders a search slot distinct from actions', () => {
    const html = renderToStaticMarkup(
      <AppShell
        title="X"
        nav={nav}
        search={<input type="search" aria-label="Search" />}
        actions={<button type="button">Sign out</button>}
      >
        body
      </AppShell>,
    )
    expect(html).toContain('type="search"')
    expect(html).toContain('Sign out')
    // search sits between the title and the actions
    expect(html.indexOf('type="search"')).toBeLessThan(html.indexOf('Sign out'))
  })

  it('passes navTone through to the built-in nav (branded rail)', () => {
    const html = renderToStaticMarkup(
      <AppShell title="X" nav={nav} navTone="branded">body</AppShell>,
    )
    expect(html).toContain('text-white/70')
    expect(html).not.toContain('bg-primary')
  })
})

describe('AppShell fixed-rail layout (#141)', () => {
  it('pins the rail full-height and makes the header sticky', () => {
    const html = renderToStaticMarkup(
      <AppShell title="X" nav={nav} layout="fixed-rail">body</AppShell>,
    )
    expect(html).toMatch(/<aside[^>]*class="[^"]*fixed inset-y-0 left-0/)
    expect(html).toMatch(/<header[^>]*class="[^"]*sticky top-0/)
  })

  it('leaves the flow layout untouched by default', () => {
    const html = renderToStaticMarkup(<AppShell title="X" nav={nav}>body</AppShell>)
    expect(html).not.toContain('<aside')
    expect(html).not.toContain('sticky top-0')
  })

  it('offsets the content by the rail at every breakpoint when there is no drawer', () => {
    // A hidden rail with no drawer would mean no nav at all below `lg`, so the
    // rail stays visible — and the offset has to match it, not be lg-only.
    const html = renderToStaticMarkup(
      <AppShell title="X" nav={nav} layout="fixed-rail">body</AppShell>,
    )
    expect(html).toContain('pl-56')
    expect(html).not.toContain('lg:pl-56')
    expect(html).not.toMatch(/<aside[^>]*class="[^"]*hidden lg:flex/)
  })

  it('makes the rail desktop-only once a drawer is supplied', () => {
    const html = renderToStaticMarkup(
      <AppShell title="X" nav={nav} layout="fixed-rail" mobileNav={<button type="button">Menu</button>}>
        body
      </AppShell>,
    )
    expect(html).toMatch(/<aside[^>]*class="[^"]*hidden lg:flex/)
    expect(html).toContain('lg:pl-56')
  })

  it('renders a railHeader on the rail, not in the header', () => {
    const html = renderToStaticMarkup(
      <AppShell title="Header title" nav={nav} layout="fixed-rail" railHeader={<span>Wordmark</span>}>
        body
      </AppShell>,
    )
    expect(html.indexOf('Wordmark')).toBeLessThan(html.indexOf('Header title'))
  })

  it('still hides its chrome when printing', () => {
    const html = renderToStaticMarkup(
      <AppShell title="X" nav={nav} layout="fixed-rail">body</AppShell>,
    )
    expect(html).toMatch(/<aside[^>]*class="[^"]*print:hidden/)
    expect(html).toMatch(/<header[^>]*class="[^"]*print:hidden/)
    expect(html).not.toMatch(/<main[^>]*class="[^"]*print:hidden/)
  })

  it('has no serious axe violations in fixed-rail layout', async () => {
    const violations = await axeViolations(
      renderToStaticMarkup(
        <AppShell title="X" nav={groups} layout="fixed-rail" railHeader={<span>Wordmark</span>}>
          body
        </AppShell>,
      ),
    )
    expect(violations.map((v) => v.id)).toEqual([])
  })
})

describe('AppShell <main> is focusable + extensible (#141)', () => {
  // axe cannot catch a regression here: the skip link and its target both
  // exist either way, so `bypass` passes whether or not focus actually moves.
  // These assertions are the only gate on it.
  it.each(['flow', 'fixed-rail'] as const)('gives <main> tabIndex="-1" in %s layout', (layout) => {
    const html = renderToStaticMarkup(
      <AppShell title="X" nav={nav} layout={layout}>body</AppShell>,
    )
    expect(html).toMatch(/<main[^>]*tabindex="-1"/i)
  })

  it('spreads mainProps onto <main> so a consumer can mark it for print', () => {
    const html = renderToStaticMarkup(
      <AppShell title="X" nav={nav} mainProps={{ 'data-print-main': '' } as never}>body</AppShell>,
    )
    expect(html).toMatch(/<main[^>]*data-print-main/)
    // the default is preserved alongside the consumer's attributes
    expect(html).toMatch(/<main[^>]*tabindex="-1"/i)
  })

  it('merges mainProps.className rather than dropping the shell defaults', () => {
    const html = renderToStaticMarkup(
      <AppShell title="X" nav={nav} mainProps={{ className: 'p-8' }}>body</AppShell>,
    )
    expect(html).toMatch(/<main[^>]*class="[^"]*flex-1[^"]*p-8/)
  })
})
