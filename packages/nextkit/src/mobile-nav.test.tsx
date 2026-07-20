// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import axe from 'axe-core'
import { MobileNavDrawer } from './client'
import { AppShell, type NavGroup } from './index'

// React 19's `act` needs this flag; there is no @testing-library/react in the
// repo and this suite doesn't need one — createRoot + act drives the drawer.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const nav = [
  { href: '/dashboard', label: 'Dashboard', active: true },
  { href: '/reports', label: 'Reports' },
]

const groups: NavGroup[] = [
  { label: 'Portfolio', defaultOpen: true, items: [{ href: '/applications', label: 'Applications' }] },
]

let root: Root | null = null
let container: HTMLElement | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  container?.remove()
  root = null
  container = null
  document.body.style.overflow = ''
})

function render(ui: React.ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(ui))
  return {
    trigger: () => document.querySelector<HTMLButtonElement>('button[aria-expanded]')!,
    panel: () => document.querySelector<HTMLElement>('[role="dialog"]')!,
    close: () => document.querySelector<HTMLButtonElement>('[role="dialog"] button')!,
    backdrop: () => document.querySelector<HTMLElement>('div[aria-hidden="true"].fixed'),
  }
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

describe('MobileNavDrawer', () => {
  it('starts closed, with the panel out of the tab order and the a11y tree', () => {
    const { trigger, panel } = render(<MobileNavDrawer nav={nav} title="GovEA" />)
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(panel().getAttribute('aria-hidden')).toBe('true')
    expect(panel().hasAttribute('inert')).toBe(true)
    // Kept mounted (so the slide can animate) but translated off-screen.
    expect(panel().className).toContain('-translate-x-full')
  })

  it('opens on the hamburger and moves focus to the close button', () => {
    const { trigger, panel, close } = render(<MobileNavDrawer nav={nav} title="GovEA" />)
    click(trigger())
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(panel().getAttribute('aria-hidden')).toBe('false')
    expect(panel().hasAttribute('inert')).toBe(false)
    expect(document.activeElement).toBe(close())
  })

  it('closes on Escape and returns focus to the hamburger', () => {
    const { trigger, panel } = render(<MobileNavDrawer nav={nav} title="GovEA" />)
    click(trigger())
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(panel().getAttribute('aria-hidden')).toBe('true')
    expect(document.activeElement).toBe(trigger())
  })

  it('closes on the backdrop', () => {
    const { trigger, panel, backdrop } = render(<MobileNavDrawer nav={nav} title="GovEA" />)
    click(trigger())
    expect(backdrop()).not.toBeNull()
    click(backdrop()!)
    expect(panel().getAttribute('aria-hidden')).toBe('true')
  })

  it('closes when a nav link is activated', () => {
    const { trigger, panel } = render(<MobileNavDrawer nav={nav} title="GovEA" />)
    click(trigger())
    const link = panel().querySelector('a[href="/reports"]')!
    // jsdom logs "Not implemented: navigation" for a real anchor activation.
    link.addEventListener('click', (e) => e.preventDefault())
    click(link)
    expect(panel().getAttribute('aria-hidden')).toBe('true')
  })

  it('locks body scroll while open and restores the previous value', () => {
    document.body.style.overflow = 'auto'
    const { trigger } = render(<MobileNavDrawer nav={nav} title="GovEA" />)
    click(trigger())
    expect(document.body.style.overflow).toBe('hidden')
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(document.body.style.overflow).toBe('auto')
  })

  it('renders grouped nav the same way the rail does', () => {
    const { trigger, panel } = render(<MobileNavDrawer nav={groups} title="GovEA" tone="branded" />)
    click(trigger())
    expect(panel().querySelector('[data-nav-group="Portfolio"]')).not.toBeNull()
    expect(panel().querySelector('a[href="/applications"]')).not.toBeNull()
  })
})

describe('AppShell mobile nav slot', () => {
  it('collapses the rail below lg only when a drawer is supplied', () => {
    const withDrawer = renderToStaticMarkup(
      <AppShell title="GovEA" nav={nav} mobileNav={<MobileNavDrawer nav={nav} />}>
        <p>Body</p>
      </AppShell>,
    )
    expect(withDrawer).toContain('hidden lg:block')

    const withoutDrawer = renderToStaticMarkup(
      <AppShell title="GovEA" nav={nav}>
        <p>Body</p>
      </AppShell>,
    )
    // Unchanged for an existing consumer (GovCRM): the rail shows at every width.
    expect(withoutDrawer).not.toContain('hidden lg:block')
  })

  it('keeps the drawer and rail nav landmarks distinctly labelled', () => {
    const markup = renderToStaticMarkup(
      <AppShell title="GovEA" nav={nav} navAriaLabel="Primary" mobileNav={<MobileNavDrawer nav={nav} />}>
        <p>Body</p>
      </AppShell>,
    )
    expect(markup).toContain('aria-label="Primary"')
    expect(markup).toContain('aria-label="Primary (mobile)"')
  })

  it('has no axe violations with the drawer open', async () => {
    const { trigger } = render(
      <AppShell title="GovEA" nav={nav} mobileNav={<MobileNavDrawer nav={nav} title="GovEA" />}>
        <p>Body</p>
      </AppShell>,
    )
    click(trigger())
    const results = await axe.run(container!, {
      resultTypes: ['violations'],
      // Contrast needs real layout; jsdom can't evaluate it (#103, #136).
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations.map((v) => v.id)).toEqual([])
  })
})
