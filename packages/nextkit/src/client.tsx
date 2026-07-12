'use client'

// @govcore/nextkit/client — the small set of client-interactive primitives kept
// out of the RSC-only main entry. (Theming controls live in ./theming.)

import type { ReactNode } from 'react'

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
