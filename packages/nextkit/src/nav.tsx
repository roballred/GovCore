// @govcore/nextkit internal — the presentational nav renderers, shared by the
// RSC entry (./index) and the client entry (./client).
//
// This module deliberately carries **no `'use client'` directive and no React
// hooks**: it is imported from both sides of the client boundary, and tsup
// inlines an imported module into each entry's bundle rather than emitting a
// shared chunk (#138). A hook here would land in `dist/index.js` without a
// directive and break npm consumers while GovEA — which consumes nextkit
// source-first via `transpilePackages` — stayed green. Keep it pure.

import type { ReactNode } from 'react'

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export interface NavItem {
  href: string
  label: string
  /** Mark the current item active. */
  active?: boolean
}

/** A sidebar section: a labeled, collapsible group of nav items. */
export interface NavGroup {
  label: string
  items: NavItem[]
  /**
   * Render this group expanded on load. Presentational, like `active`: the
   * consumer sets it (typically for the group containing the current route) so
   * the active section is open without any client JS.
   */
  defaultOpen?: boolean
}

/**
 * Which surface the nav is painted on (#103).
 *
 * - `surface` (default) — the light content-area sidebar: foreground text on
 *   `muted` hovers, `primary` active pill. What GovCRM uses.
 * - `branded` — a dark brand rail sitting on `--header-bg`, where the content
 *   tokens would render dark-on-dark. Uses white-alpha tones, matching the
 *   header's own foreground treatment. What GovEA's sidebar needs.
 *
 * `branded` deliberately keys off white-alpha rather than new theme tokens: it
 * layers on the same `--header-bg`/`--header-fg` pair the AppShell header
 * already uses, so brand themes stay within the existing allowlist and no
 * surface token has to be re-contrast-reviewed.
 */
export type NavTone = 'surface' | 'branded'

/** Shared item-link styling for the flat and grouped sidebars. */
function navLinkClass(active?: boolean, tone: NavTone = 'surface'): string {
  if (tone === 'branded') {
    return cx(
      'block rounded-md px-3 py-2 text-sm transition-colors',
      active ? 'bg-white/15 font-medium text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
    )
  }
  return cx(
    'block rounded-md px-3 py-2 text-sm',
    active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted',
  )
}

/** Shared group-header styling, tone-matched to the item links. */
function groupSummaryClass(tone: NavTone = 'surface'): string {
  return cx(
    'flex cursor-pointer list-none items-center justify-between rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wide [&::-webkit-details-marker]:hidden',
    // #103 shipped the branded group header at white/60 for a dimmer label. But
    // on the branded rail — `--header-bg` under any active/hover white overlay
    // (bg-white/15) — white/60 measures ~4.2:1, just under WCAG AA (a real axe
    // gate caught it; the jsdom unit tests can't evaluate contrast). white/70
    // clears it (~5.1:1) and matches the item links, which pass on the same
    // surface. The item-vs-header hierarchy now comes from weight/casing, not a
    // sub-AA opacity.
    tone === 'branded'
      ? 'text-white/70 hover:bg-white/10 hover:text-white'
      : 'text-muted-foreground hover:bg-muted',
  )
}

function NavLink({ item, tone }: { item: NavItem; tone?: NavTone }) {
  return (
    <a href={item.href} aria-current={item.active ? 'page' : undefined} className={navLinkClass(item.active, tone)}>
      {item.label}
    </a>
  )
}

/**
 * The left sidebar nav list. Presentational: `active` is computed by the
 * consumer (a ~5-line client wrapper on `usePathname` keeps this package free
 * of client hooks).
 */
export function SideNav({
  items,
  ariaLabel = 'Primary',
  tone,
  className,
}: {
  items: NavItem[]
  ariaLabel?: string
  /** Paint for a light content sidebar (default) or a dark brand rail. */
  tone?: NavTone
  /**
   * Replaces the default `w-48` sizing — pass your own width/layout classes
   * when the nav lives inside a rail that already owns its width. `cx` only
   * concatenates (no Tailwind conflict resolution), so this substitutes rather
   * than appends, keeping the emitted width deterministic.
   */
  className?: string
}) {
  return (
    <nav aria-label={ariaLabel} className={cx('shrink-0', className ?? 'w-48')}>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.href}>
            <NavLink item={item} tone={tone} />
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * The grouped sidebar: collapsible sections over the same items as SideNav.
 * Presentational and client-hook-free — collapsing uses a native `<details>`
 * exclusive accordion (all groups share a `name`, so opening one closes the
 * others), and the consumer marks the current section `defaultOpen`. Role- and
 * module-gating are the consumer's job too: filter groups/items before passing
 * them in (as the flat SideNav expects `active` pre-computed).
 *
 * `tone="branded"` paints it for a dark brand rail; `topItems` renders ungrouped
 * links above the sections; `className` replaces the default width when the nav
 * sits inside a rail that owns its own sizing (#103).
 *
 * **Persisting or scripting the open section.** There is no `openGroup` /
 * `onOpenChange` pair on purpose: a controlled accordion needs React state,
 * which would make this a client component and ship JS to every consumer — and
 * the native `<details>` already exposes the same control through the DOM. Each
 * section carries `data-nav-group="<label>"`, so a consumer's own client code
 * can do both jobs against the platform API:
 *
 * ```ts
 * const el = document.querySelector<HTMLDetailsElement>('[data-nav-group="Portfolio"]')
 * el.open = true                                  // imperative open (product tour)
 * el.addEventListener('toggle', () => persist(el.open))  // persistence
 * ```
 */
export function GroupedSideNav({
  groups,
  topItems,
  ariaLabel = 'Primary',
  tone,
  className,
}: {
  groups: NavGroup[]
  /**
   * Ungrouped links rendered flat above the groups (#103) — the "Dashboard" /
   * "Overview" entries that head a real sidebar and belong to no section. Same
   * active/tone treatment as the grouped items.
   */
  topItems?: NavItem[]
  ariaLabel?: string
  /** Paint for a light content sidebar (default) or a dark brand rail. */
  tone?: NavTone
  /** Replaces the default `w-48` sizing — see {@link SideNav}. */
  className?: string
}) {
  const accordionName = `${ariaLabel.replace(/\s+/g, '-').toLowerCase()}-nav`
  return (
    <nav aria-label={ariaLabel} className={cx('shrink-0 space-y-1', className ?? 'w-48')}>
      {topItems && topItems.length > 0 && (
        <ul className="space-y-1">
          {topItems.map((item) => (
            <li key={item.href}>
              <NavLink item={item} tone={tone} />
            </li>
          ))}
        </ul>
      )}
      {groups.map((group) => (
        <details
          key={group.label}
          name={accordionName}
          open={group.defaultOpen}
          // A stable DOM hook so a consumer can persist the open section or drive
          // it imperatively (a product tour opening a parent group) by setting
          // `.open` — no controlled React state, which would force this whole nav
          // to 'use client' and ship JS to consumers that never need it.
          data-nav-group={group.label}
          className="[&[open]_.nav-chevron]:rotate-90"
        >
          <summary className={groupSummaryClass(tone)}>
            <span>{group.label}</span>
            <svg
              className="nav-chevron h-3.5 w-3.5 shrink-0 transition-transform"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </summary>
          <ul className="mt-1 space-y-1 pl-2">
            {group.items.map((item) => (
              <li key={item.href}>
                <NavLink item={item} tone={tone} />
              </li>
            ))}
          </ul>
        </details>
      ))}
    </nav>
  )
}

/** True when `nav` is a NavGroup[] (has grouped sections) rather than a flat NavItem[]. */
export function isNavGroups(nav: NavItem[] | NavGroup[]): nav is NavGroup[] {
  return nav.length > 0 && 'items' in nav[0]
}

/**
 * Render whatever a shell's `nav` prop turned out to be: flat items, grouped
 * sections, or a consumer's own ReactNode. Shared so the desktop rail and the
 * mobile drawer stay identical by construction.
 */
export function renderNav(
  nav: NavItem[] | NavGroup[] | ReactNode,
  opts: { ariaLabel?: string; tone?: NavTone; className?: string },
): ReactNode {
  if (!Array.isArray(nav)) return nav
  return isNavGroups(nav) ? (
    <GroupedSideNav groups={nav} ariaLabel={opts.ariaLabel} tone={opts.tone} className={opts.className} />
  ) : (
    <SideNav items={nav} ariaLabel={opts.ariaLabel} tone={opts.tone} className={opts.className} />
  )
}
