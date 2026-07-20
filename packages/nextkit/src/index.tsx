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

// The presentational nav renderers live in ./nav so the client entry can share
// them without pulling this RSC-only module across the boundary (#138).
export { SideNav, GroupedSideNav } from './nav'
export type { NavItem, NavGroup, NavTone } from './nav'
import { renderNav, type NavItem, type NavGroup, type NavTone } from './nav'

/**
 * How wide the shell lets its content run (#102).
 *
 * - `contained` (default) — the centered `max-w-6xl` column. Reading-width, and
 *   what a lighter consumer (GovCRM) wants.
 * - `fluid` — full width. An information-dense app (GovEA: graphs, heatmaps, a
 *   traceability matrix, ~20 entity tables) overflows or squishes inside 1152px.
 */
export type ShellWidth = 'contained' | 'fluid'

/**
 * The product-plane app shell: branded header (`--header-bg`/`--header-fg`
 * tokens), left sidebar, main content. `nav` may be a flat `NavItem[]` (→
 * SideNav), a grouped `NavGroup[]` (→ GroupedSideNav), or a ReactNode (e.g. a
 * consumer's client nav wrapper); `actions` is a header slot for sign-out forms
 * and the like, and `search` a wider slot for a product search box.
 *
 * Accessible and print-ready by default (#102): it emits a skip-link to the
 * `<main>` landmark (WCAG 2.4.1) alongside the `banner`/`navigation`/`main`
 * landmarks, and hides its own chrome — header and sidebar — under
 * `@media print`, so a consumer's exported handout prints as just the content.
 *
 * **Responsive mobile nav** (#102 gap 2) is opt-in through `mobileNav`: pass
 * `<MobileNavDrawer>` from `@govcore/nextkit/client` and the sidebar collapses
 * to a hamburger-triggered drawer below `lg`. Omit it and the shell renders
 * exactly as before — the rail keeps its width at every breakpoint — so an
 * existing consumer sees no change.
 *
 * The drawer is a slot rather than something AppShell builds itself because it
 * needs client state, and this module is the RSC-only entry: importing a
 * `'use client'` module here inlines it into `dist/index.js` without the
 * directive (#138), which breaks npm consumers while a source-first consumer
 * like GovEA stays green.
 */
export function AppShell({
  title,
  nav,
  navAriaLabel = 'Primary',
  navTone,
  user,
  actions,
  search,
  mobileNav,
  width = 'contained',
  mainId = 'main-content',
  skipLinkLabel = 'Skip to main content',
  children,
}: {
  title: ReactNode
  nav: NavItem[] | NavGroup[] | ReactNode
  navAriaLabel?: string
  /** Tone for the built-in navs — `branded` for a dark rail (#103). */
  navTone?: NavTone
  user?: { name?: string | null; email?: string | null }
  actions?: ReactNode
  /** Header slot between the title and the actions — e.g. a product search box. */
  search?: ReactNode
  /**
   * Mobile nav slot, rendered at the header's leading edge (#102). Intended for
   * `<MobileNavDrawer>` from `@govcore/nextkit/client`, which supplies its own
   * hamburger and drawer. Providing it also collapses the desktop rail below
   * `lg`, so the two never show at once.
   */
  mobileNav?: ReactNode
  /** Content width: reading-width `contained` (default) or full-width `fluid`. */
  width?: ShellWidth
  /** id of the `<main>` landmark the skip-link targets. */
  mainId?: string
  skipLinkLabel?: string
  children: ReactNode
}) {
  const container = width === 'fluid' ? 'w-full px-6' : 'mx-auto max-w-6xl px-6'
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* First focusable thing on the page: invisible until focused, then pinned
          top-left over the header (WCAG 2.4.1 — bypass the nav). */}
      <a
        href={`#${mainId}`}
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {skipLinkLabel}
      </a>
      <header className="bg-header text-header-foreground print:hidden">
        <div className={cx('flex items-center justify-between gap-4 py-3', container)}>
          {mobileNav}
          <span className="shrink-0 text-lg font-semibold">{title}</span>
          {search ? <div className="min-w-0 flex-1 md:max-w-md">{search}</div> : null}
          <div className="flex shrink-0 items-center gap-4">
            {user ? <span className="text-sm opacity-90">{user.name ?? user.email}</span> : null}
            {actions}
          </div>
        </div>
      </header>
      <div className={cx('flex gap-8 py-8', container)}>
        {/* With a drawer in play the rail is desktop-only, so the same links
            aren't exposed twice (and to AT twice) below `lg`. */}
        <div className={cx('shrink-0 print:hidden', mobileNav ? 'hidden lg:block' : undefined)}>
          {renderNav(nav, { ariaLabel: navAriaLabel, tone: navTone })}
        </div>
        <main id={mainId} className="min-w-0 flex-1">
          {children}
        </main>
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
