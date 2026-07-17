// @govcore/nextkit — reusable React for GovCore apps.
//
// Presentational (data passed as props, no data fetching here) and RSC-friendly
// (no client hooks), styled with the @govcore/theme Tailwind tokens so a brand
// theme restyles them for free. The instance-console pieces are the reusable
// instance-admin surface (design §11.6); AppShell is the product-plane shell
// every consumer otherwise rebuilds (#58).

import type { ReactNode } from 'react'
import {
  themeToCss,
  DARK_STORAGE_KEY,
  THEME_STORAGE_KEY,
  type ThemeDefinition,
} from '@govcore/theme'

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

// ── Layout shell ────────────────────────────────────────────────────────────

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
    tone === 'branded'
      ? 'text-white/60 hover:bg-white/10 hover:text-white'
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
function isNavGroups(nav: NavItem[] | NavGroup[]): nav is NavGroup[] {
  return nav.length > 0 && 'items' in nav[0]
}

/**
 * The product-plane app shell: branded header (`--header-bg`/`--header-fg`
 * tokens), left sidebar, main content. `nav` may be a flat `NavItem[]` (→
 * SideNav), a grouped `NavGroup[]` (→ GroupedSideNav), or a ReactNode (e.g. a
 * consumer's client nav wrapper); `actions` is a header slot for sign-out forms
 * and the like.
 */
export function AppShell({
  title,
  nav,
  navAriaLabel = 'Primary',
  user,
  actions,
  children,
}: {
  title: ReactNode
  nav: NavItem[] | NavGroup[] | ReactNode
  navAriaLabel?: string
  user?: { name?: string | null; email?: string | null }
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="bg-header text-header-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <span className="text-lg font-semibold">{title}</span>
          <div className="flex items-center gap-4">
            {user ? <span className="text-sm opacity-90">{user.name ?? user.email}</span> : null}
            {actions}
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-6xl gap-8 px-6 py-8">
        {Array.isArray(nav) ? (
          isNavGroups(nav) ? (
            <GroupedSideNav groups={nav} ariaLabel={navAriaLabel} />
          ) : (
            <SideNav items={nav} ariaLabel={navAriaLabel} />
          )
        ) : (
          nav
        )}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}

export function InstanceConsoleShell({
  title,
  nav,
  user,
  children,
}: {
  title: string
  nav: NavItem[]
  user?: { name?: string | null; email?: string | null }
  children: ReactNode
}) {
  return (
    <AppShell title={title} nav={nav} navAriaLabel="Instance console" user={user}>
      {children}
    </AppShell>
  )
}

// ── Theming ─────────────────────────────────────────────────────────────────

/**
 * Apply a brand theme (from @govcore/theme's defineTheme) in a root layout:
 * `<ThemeStyle theme={myTheme} />`. Values are allowlisted and sanitized by
 * defineTheme (#769), so the inline style block is safe by construction.
 */
export function ThemeStyle({ theme, selector }: { theme: ThemeDefinition; selector?: string }) {
  return <style dangerouslySetInnerHTML={{ __html: themeToCss(theme, selector) }} />
}

/**
 * Restore the saved brand theme + dark mode on <html> **before first paint** so
 * a reload never flashes the default theme. Render it in the document <head>
 * (Next: in the root layout's <head>) ahead of the app. Pairs with the
 * `ThemeSelector`/`DarkModeToggle` from `@govcore/nextkit/theming`, which write
 * the same localStorage keys. The script is a fixed string over internal key
 * constants — no interpolation of untrusted input.
 */
export function ThemeInitScript() {
  const js =
    `(function(){try{` +
    `var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
    `if(t)document.documentElement.setAttribute('data-theme',t);` +
    `var d=localStorage.getItem(${JSON.stringify(DARK_STORAGE_KEY)});` +
    `var dark=d?d==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;` +
    `document.documentElement.classList.toggle('dark',dark);` +
    `}catch(e){}})();`
  return <script dangerouslySetInnerHTML={{ __html: js }} />
}

// ── Primitives ──────────────────────────────────────────────────────────────

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    </div>
  )
}

export function StatCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  )
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'muted' | 'danger' }) {
  const tones = {
    default: 'bg-primary/10 text-primary',
    muted: 'bg-muted text-muted-foreground',
    danger: 'bg-destructive/10 text-destructive',
  }
  return (
    <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', tones[tone])}>
      {children}
    </span>
  )
}

// ── Pagination ────────────────────────────────────────────────────────────────
//
// Server-driven, App-Router-friendly: the page reads its slice from the URL
// (`parsePageParams`), fetches exactly that slice (LIMIT/OFFSET) plus a total,
// and hands DataTable a `pagination` prop. The controls are plain links — no
// client JS — so pagination works in a Server Component with nothing hydrated.

export const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100

/** A resolved page slice. `offset` is `(page-1)*pageSize`, ready for LIMIT/OFFSET. */
export interface PageParams {
  page: number
  pageSize: number
  offset: number
}

function toInt(v: string | undefined, fallback: number): number {
  const n = Number.parseInt(v ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/**
 * Parse `page`/`pageSize` from App Router `searchParams` (a plain object or a
 * `URLSearchParams`). Page is clamped to ≥1 and pageSize to `[1, maxPageSize]`;
 * missing/garbage values fall back to defaults — so a hand-edited URL can never
 * produce a negative offset or an unbounded query.
 */
export function parsePageParams(
  searchParams?: Record<string, string | string[] | undefined> | URLSearchParams,
  opts?: { defaultPageSize?: number; maxPageSize?: number },
): PageParams {
  const read = (k: string): string | undefined => {
    if (!searchParams) return undefined
    if (searchParams instanceof URLSearchParams) return searchParams.get(k) ?? undefined
    const v = searchParams[k]
    return Array.isArray(v) ? v[0] : v
  }
  const maxPageSize = opts?.maxPageSize ?? MAX_PAGE_SIZE
  const page = toInt(read('page'), 1)
  const pageSize = Math.min(maxPageSize, toInt(read('pageSize'), opts?.defaultPageSize ?? DEFAULT_PAGE_SIZE))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

/**
 * Build the href for a target page, preserving the other query params (filters,
 * pageSize) already on the URL. Use as `hrefForPage` on the pagination prop.
 */
export function pageHref(
  pathname: string,
  searchParams: Record<string, string | string[] | undefined> | URLSearchParams | undefined,
  page: number,
): string {
  const params = new URLSearchParams()
  if (searchParams instanceof URLSearchParams) {
    searchParams.forEach((v, k) => params.set(k, v))
  } else if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (v != null) params.set(k, Array.isArray(v) ? (v[0] ?? '') : v)
    }
  }
  params.set('page', String(page))
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

export interface PaginationProps {
  page: number
  pageSize: number
  total: number
  /** Build the href for a target page — typically `pageHref.bind(null, pathname, searchParams)`. */
  hrefForPage: (page: number) => string
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: ReactNode }) {
  if (disabled) {
    return <span className="rounded-md px-2 py-1 text-muted-foreground/50">{children}</span>
  }
  return (
    <a href={href} className="rounded-md px-2 py-1 text-foreground hover:bg-muted">
      {children}
    </a>
  )
}

/** The prev/next + count footer. Rendered by DataTable when `pagination` is set. */
export function TablePagination({ page, pageSize, total, hrefForPage }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-2 text-sm text-muted-foreground">
      <span>{total === 0 ? 'No results' : `Showing ${from}–${to} of ${total}`}</span>
      <div className="flex items-center gap-1">
        <PageLink href={hrefForPage(page - 1)} disabled={page <= 1}>
          ← Previous
        </PageLink>
        <span className="px-2">
          Page {page} of {totalPages}
        </span>
        <PageLink href={hrefForPage(page + 1)} disabled={page >= totalPages}>
          Next →
        </PageLink>
      </div>
    </div>
  )
}

// ── Data table ──────────────────────────────────────────────────────────────

export interface Column<Row> {
  key: string
  header: string
  /** Render a cell. Defaults to String(row[key]). */
  cell?: (row: Row) => ReactNode
}

export function DataTable<Row extends Record<string, unknown>>({
  columns,
  rows,
  empty = 'No rows.',
  pagination,
}: {
  columns: Column<Row>[]
  rows: Row[]
  empty?: string
  /** When set, renders a server-driven prev/next + count footer below the table. */
  pagination?: PaginationProps
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className="px-4 py-2 text-left font-medium">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-6 text-center text-muted-foreground">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="border-t border-border">
                {columns.map((c) => (
                  <td key={c.key} className="px-4 py-2 align-top">
                    {c.cell ? c.cell(row) : String(row[c.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      {pagination ? <TablePagination {...pagination} /> : null}
    </div>
  )
}

// ── Support access ────────────────────────────────────────────────────────────
// Break-glass / act-as surfaces. In a sibling module because they reference the
// @govcore/support status vocabulary; re-exported here as the package's API.
export {
  SupportSessionsTable,
  TenantSupportVisibility,
  ActAsBanner,
  BreakGlassGrantForm,
  supportStatusTone,
  type SupportSessionView,
  type GrantFormOrg,
} from './support'
