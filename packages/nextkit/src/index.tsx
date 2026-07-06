// @govcore/nextkit — reusable React for GovCore apps.
//
// Presentational (data passed as props, no data fetching here) and RSC-friendly
// (no client hooks), styled with the @govcore/theme Tailwind tokens so a brand
// theme restyles them for free. The instance-console pieces are the reusable
// instance-admin surface (design §11.6); AppShell is the product-plane shell
// every consumer otherwise rebuilds (#58).

import type { ReactNode } from 'react'
import { themeToCss, type ThemeDefinition } from '@govcore/theme'

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

/**
 * The left sidebar nav list. Presentational: `active` is computed by the
 * consumer (a ~5-line client wrapper on `usePathname` keeps this package free
 * of client hooks).
 */
export function SideNav({ items, ariaLabel = 'Primary' }: { items: NavItem[]; ariaLabel?: string }) {
  return (
    <nav aria-label={ariaLabel} className="w-48 shrink-0">
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={cx(
                'block rounded-md px-3 py-2 text-sm',
                item.active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground hover:bg-muted',
              )}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * The product-plane app shell: branded header (`--header-bg`/`--header-fg`
 * tokens), left SideNav, main content. `nav` may be a NavItem[] (rendered via
 * SideNav) or a ReactNode (e.g. a consumer's client nav wrapper); `actions` is
 * a header slot for sign-out forms and the like.
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
  nav: NavItem[] | ReactNode
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
        {Array.isArray(nav) ? <SideNav items={nav} ariaLabel={navAriaLabel} /> : nav}
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
}: {
  columns: Column<Row>[]
  rows: Row[]
  empty?: string
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
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
