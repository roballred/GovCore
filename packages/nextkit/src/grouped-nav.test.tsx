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
