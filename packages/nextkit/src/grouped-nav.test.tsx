import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AppShell, GroupedSideNav, type NavGroup } from './index'

const groups: NavGroup[] = [
  {
    label: 'Business Architecture',
    defaultOpen: true,
    items: [
      { href: '/capabilities', label: 'Capabilities', active: true },
      { href: '/personas', label: 'Personas' },
    ],
  },
  {
    label: 'Portfolio',
    items: [{ href: '/applications', label: 'Applications' }],
  },
]

describe('GroupedSideNav', () => {
  it('renders each group label and its item links', () => {
    const html = renderToStaticMarkup(<GroupedSideNav groups={groups} />)
    expect(html).toContain('Business Architecture')
    expect(html).toContain('Portfolio')
    expect(html).toContain('href="/capabilities"')
    expect(html).toContain('href="/applications"')
  })

  it('marks the active item (aria-current + primary styling)', () => {
    const html = renderToStaticMarkup(<GroupedSideNav groups={groups} />)
    expect(html).toMatch(/href="\/capabilities"[^>]*aria-current="page"/)
    expect(html).toContain('bg-primary')
  })

  it('opens only the group flagged defaultOpen, via a shared accordion name', () => {
    const html = renderToStaticMarkup(<GroupedSideNav groups={groups} ariaLabel="Primary" />)
    // exactly one <details open>
    expect(html.match(/<details[^>]*\sopen\b/g)?.length).toBe(1)
    // native exclusive accordion: every group shares the same name
    expect(html.match(/name="primary-nav"/g)?.length).toBe(2)
  })

  // #103 — the branded rail, ungrouped items, and the DOM hook for open control.
  it('paints content-surface tones by default', () => {
    const html = renderToStaticMarkup(<GroupedSideNav groups={groups} />)
    expect(html).toContain('bg-primary')
    expect(html).toContain('text-muted-foreground')
    expect(html).not.toContain('text-white/70')
  })

  it('paints white-alpha tones on a branded rail, for items and group headers', () => {
    const html = renderToStaticMarkup(<GroupedSideNav groups={groups} tone="branded" />)
    // active item: readable on a dark rail rather than the primary pill
    expect(html).toMatch(/href="\/capabilities"[^>]*class="[^"]*bg-white\/15/)
    // items AND group headers use white/70 — WCAG-AA on the branded rail even
    // under a white-alpha overlay (bg-white/15). white/60 dipped below AA there.
    expect(html).toContain('text-white/70')
    expect(html).not.toContain('text-white/60')
    // the content-surface tones must not leak through on a dark rail
    expect(html).not.toContain('bg-primary')
    expect(html).not.toContain('text-muted-foreground')
  })

  it('renders ungrouped topItems above the groups, sharing the active treatment', () => {
    const html = renderToStaticMarkup(
      <GroupedSideNav
        groups={groups}
        topItems={[{ href: '/dashboard', label: 'Dashboard', active: true }]}
      />,
    )
    expect(html).toMatch(/href="\/dashboard"[^>]*aria-current="page"/)
    // flat: above the first <details>, not inside one
    expect(html.indexOf('href="/dashboard"')).toBeLessThan(html.indexOf('<details'))
  })

  it('exposes a data-nav-group hook per section for persistence / imperative open', () => {
    const html = renderToStaticMarkup(<GroupedSideNav groups={groups} />)
    expect(html).toContain('data-nav-group="Business Architecture"')
    expect(html).toContain('data-nav-group="Portfolio"')
  })

  it('lets className replace the default width for a consumer-owned rail', () => {
    const html = renderToStaticMarkup(<GroupedSideNav groups={groups} className="w-full" />)
    expect(html).toContain('w-full')
    expect(html).not.toContain('w-48')
  })
})

describe('AppShell nav dispatch', () => {
  it('renders GroupedSideNav for a NavGroup[]', () => {
    const html = renderToStaticMarkup(
      <AppShell title="X" nav={groups}>
        body
      </AppShell>,
    )
    expect(html).toContain('Business Architecture')
    expect(html).toContain('<details')
  })

  it('renders a flat SideNav for a NavItem[]', () => {
    const html = renderToStaticMarkup(
      <AppShell title="X" nav={[{ href: '/a', label: 'A' }]}>
        body
      </AppShell>,
    )
    expect(html).toContain('href="/a"')
    expect(html).not.toContain('<details')
  })
})
