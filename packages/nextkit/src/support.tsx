// @govcore/nextkit — support-access surfaces (break-glass / act-as).
//
// Presentational, matching the rest of nextkit: a consumer resolves ids to
// labels and derives each session's status (via @govcore/support's
// breakGlassStatus/actAsStatus) into a SupportSessionView, and these render it.
// The operator sees SupportSessionsTable; the affected tenant's admins see
// TenantSupportVisibility (the panel that satisfies the "support access is
// visible to the org" rule); an impersonating operator carries ActAsBanner.

import type { ReactNode } from 'react'
import type { SupportSessionStatus } from '@govcore/support'
import { Badge } from './index'

/** A session shaped for display — ids already resolved to labels, status derived. */
export interface SupportSessionView {
  id: string
  operator: string
  tenant: string
  /** Preformatted timestamp (the consumer owns locale/formatting). */
  when: string
  /** Reason (break-glass) or end reason (act-as). */
  detail?: string
  status: SupportSessionStatus
}

/**
 * Badge tone for a session status. `active` is intentionally `danger` — an
 * operator holding access *right now* is the state to draw the eye; everything
 * terminal (`expired`/`revoked`/`ended`) is muted, and `pending` is neutral.
 */
export function supportStatusTone(status: SupportSessionStatus): 'default' | 'muted' | 'danger' {
  if (status === 'active') return 'danger'
  if (status === 'pending') return 'default'
  return 'muted'
}

/**
 * Tabular list of support sessions with a status badge. `showTenant={false}` for
 * the tenant-side panel, where every row is the same org.
 */
export function SupportSessionsTable({
  sessions,
  empty = 'None.',
  showTenant = true,
}: {
  sessions: SupportSessionView[]
  empty?: ReactNode
  showTenant?: boolean
}) {
  const cols = showTenant ? 5 : 4
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-2 text-left font-medium">Operator</th>
            {showTenant ? (
              <th scope="col" className="px-4 py-2 text-left font-medium">Tenant</th>
            ) : null}
            <th scope="col" className="px-4 py-2 text-left font-medium">When</th>
            <th scope="col" className="px-4 py-2 text-left font-medium">Detail</th>
            <th scope="col" className="px-4 py-2 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {sessions.length === 0 ? (
            <tr>
              <td colSpan={cols} className="px-4 py-6 text-center text-muted-foreground">
                {empty}
              </td>
            </tr>
          ) : (
            sessions.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-4 py-2 align-top">{s.operator}</td>
                {showTenant ? <td className="px-4 py-2 align-top">{s.tenant}</td> : null}
                <td className="px-4 py-2 align-top">{s.when}</td>
                <td className="px-4 py-2 align-top text-muted-foreground">{s.detail ?? '—'}</td>
                <td className="px-4 py-2 align-top">
                  <Badge tone={supportStatusTone(s.status)}>{s.status}</Badge>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The tenant-side visibility panel: an org admin seeing whether — and when — an
 * operator accessed their organization's data. Leads with a live-access warning
 * when any session is active, and a reassuring empty state otherwise (the point
 * of the panel is that "nothing here" is the healthy, verifiable answer).
 */
export function TenantSupportVisibility({
  sessions,
  orgName,
}: {
  sessions: SupportSessionView[]
  orgName?: string
}) {
  const hasActive = sessions.some((s) => s.status === 'active')
  return (
    <section aria-label="Support access">
      <h2 className="text-lg font-semibold">Support access{orgName ? ` to ${orgName}` : ''}</h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">
        When a support request is opened, an operator may be granted time-boxed, audited access to
        your data. Every such session is recorded and shown here.
      </p>
      {hasActive ? (
        <div
          role="alert"
          className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          An operator currently has active access to your organization's data.
        </div>
      ) : null}
      {sessions.length === 0 ? (
        <p className="rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          No operator has accessed your organization's data. That is the healthy state.
        </p>
      ) : (
        <SupportSessionsTable sessions={sessions} showTenant={false} />
      )}
    </section>
  )
}

/**
 * The banner an impersonating operator carries while an act-as session is live —
 * a persistent, unmissable reminder that they are inside a tenant and audited.
 * `endAction` (a server action) renders an inline End button; omit it for a
 * read-only indicator.
 */
export function ActAsBanner({
  tenant,
  operator,
  endAction,
  endLabel = 'End session',
}: {
  tenant: string
  operator?: string
  endAction?: (formData: FormData) => void | Promise<void>
  endLabel?: string
}) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-4 bg-destructive px-4 py-2 text-sm text-destructive-foreground"
    >
      <span>
        You are acting inside <strong>{tenant}</strong>
        {operator ? (
          <>
            {' '}
            as <strong>{operator}</strong>
          </>
        ) : null}
        . Every action is audited.
      </span>
      {endAction ? (
        <form action={endAction}>
          <button
            type="submit"
            className="rounded-md bg-background/20 px-3 py-1 font-medium hover:bg-background/30"
          >
            {endLabel}
          </button>
        </form>
      ) : null}
    </div>
  )
}

export interface GrantFormOrg {
  id: string
  name: string
}

/**
 * The break-glass request form: pick a target org, state a reason (audited), set
 * a duration. Posts to the consumer's `action` (a server action wrapping
 * `grantBreakGlass`). Presentational — no client state.
 */
export function BreakGlassGrantForm({
  action,
  organizations,
  ttlOptions = [30, 60, 240],
  defaultTtl = 60,
}: {
  action: (formData: FormData) => void | Promise<void>
  organizations: GrantFormOrg[]
  ttlOptions?: number[]
  defaultTtl?: number
}) {
  const field = 'mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm'
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="bg-org" className="block text-sm font-medium">
          Organization
        </label>
        <select id="bg-org" name="targetOrgId" required className={field}>
          {organizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="bg-reason" className="block text-sm font-medium">
          Reason
        </label>
        <textarea
          id="bg-reason"
          name="reason"
          required
          rows={3}
          className={field}
          placeholder="Why do you need access? (recorded in the audit trail)"
        />
      </div>
      <div>
        <label htmlFor="bg-ttl" className="block text-sm font-medium">
          Duration
        </label>
        <select id="bg-ttl" name="ttlMinutes" defaultValue={defaultTtl} className={field}>
          {ttlOptions.map((m) => (
            <option key={m} value={m}>
              {m} minutes
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Request break-glass access
      </button>
    </form>
  )
}
