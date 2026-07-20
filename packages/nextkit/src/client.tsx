'use client'

// @govcore/nextkit/client — the small set of client-interactive primitives kept
// out of the RSC-only main entry. (Theming controls live in ./theming.)

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { renderNav, type NavGroup, type NavItem, type NavTone } from './nav'

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/**
 * A submit button that asks for confirmation before letting its `<form>` submit
 * — the one client wrinkle for destructive actions (delete) in otherwise-RSC
 * screens. On click, if the user cancels the native confirm, the submit is
 * prevented. Place inside a `<form action={serverAction}>`.
 */
export function ConfirmButton({
  children,
  message = 'Are you sure?',
  className,
}: {
  children: ReactNode
  message?: string
  className?: string
}) {
  return (
    <button
      type="submit"
      className={cx('cursor-pointer', className)}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault()
      }}
    >
      {children}
    </button>
  )
}

/** Header control tones, matched to AppShell's `nav`/header surfaces. */
const drawerTone = {
  branded: {
    panel: 'bg-header text-header-foreground',
    control: 'text-header-foreground hover:bg-white/10',
  },
  surface: {
    panel: 'bg-background text-foreground',
    control: 'text-header-foreground hover:bg-black/10',
  },
} as const

/**
 * The responsive mobile nav for `AppShell` (#102 gap 2): a hamburger that opens
 * a slide-in drawer over a backdrop below `lg`, and renders nothing at `lg` and
 * up, where the shell's own rail takes over. Pass it as AppShell's `mobileNav`
 * and hand it the same `nav` the shell gets, so both render identical links:
 *
 * ```tsx
 * <AppShell nav={nav} navTone="branded" mobileNav={<MobileNavDrawer nav={nav} tone="branded" title="GovEA" />}>
 * ```
 *
 * Accessibility: the panel is a labelled `role="dialog" aria-modal`, the trigger
 * carries `aria-expanded`/`aria-controls`, Escape closes, focus moves to the
 * close button on open and returns to the trigger on close, and the closed
 * panel is `inert` + `aria-hidden` so its links stay out of the tab order and
 * the accessibility tree while it's translated off-screen (staying mounted is
 * what lets the transition animate).
 *
 * Colors here are deliberately full-opacity on the `header`/`background` token
 * pairs the theme already guarantees at AA, rather than the white-alpha tints
 * used for nav *items* — jsdom axe cannot evaluate contrast (#103), so the
 * drawer chrome avoids introducing any value that would need a real-browser
 * gate to verify.
 */
export function MobileNavDrawer({
  nav,
  title,
  tone = 'surface',
  ariaLabel = 'Primary (mobile)',
  openLabel = 'Open navigation',
  closeLabel = 'Close navigation',
}: {
  /** Same shape AppShell accepts — flat items, grouped sections, or your own node. */
  nav: NavItem[] | NavGroup[] | ReactNode
  /** Optional heading inside the drawer, typically the product wordmark. */
  title?: ReactNode
  /** Match AppShell's `navTone`. */
  tone?: NavTone
  /** Label for the drawer's nav landmark — distinct from the desktop rail's, so the two landmarks stay unique. */
  ariaLabel?: string
  openLabel?: string
  closeLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  // Restoring focus only when the drawer was *actually* open avoids stealing it
  // on mount, when the effect also runs with `open === false`.
  const wasOpen = useRef(false)

  useEffect(() => {
    if (open) {
      closeRef.current?.focus()
    } else if (wasOpen.current) {
      triggerRef.current?.focus()
    }
    wasOpen.current = open
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      // Restore what was there rather than clearing, so we don't stomp a lock
      // some other overlay set.
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  const styles = drawerTone[tone]

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={openLabel}
        className={cx('shrink-0 rounded-md p-1.5 transition-colors lg:hidden print:hidden', styles.control)}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden print:hidden" aria-hidden="true" onClick={() => setOpen(false)} />
      )}

      <div
        id={panelId}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-hidden={!open}
        inert={!open}
        className={cx(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col overflow-y-auto border-r transition-transform duration-200 ease-in-out lg:hidden print:hidden',
          styles.panel,
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
          <span className="truncate text-lg font-semibold">{title}</span>
          <button
            ref={closeRef}
            type="button"
            onClick={() => setOpen(false)}
            aria-label={closeLabel}
            className={cx('shrink-0 rounded-md p-1.5 transition-colors', styles.control)}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Close on link activation. nextkit has no `next/navigation` dependency
            and shouldn't grow one for this, so the drawer keys off the click
            that starts the navigation rather than the route change that ends
            it — which also works for a plain <a>, a Next <Link>, or any router. */}
        <div
          className="flex-1 p-3"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('a')) setOpen(false)
          }}
        >
          {renderNav(nav, { ariaLabel, tone, className: 'w-full' })}
        </div>
      </div>
    </>
  )
}
