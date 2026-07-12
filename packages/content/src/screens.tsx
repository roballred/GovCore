// @govcore/content/screens — generate a content type's React screens.
//
// Appendix B: the engine "automatically provides … the create/edit/list/detail
// screens." These mirror the generated actions (./actions): the same definition
// that compiles to a table and CRUD tenantActions also derives its UI. Screens
// are presentational and RSC-friendly — data is passed as props (use the
// generated `list()`/`get()` actions to fetch it), forms post to a server
// `action`, and there are no client hooks — so they render on the server and a
// brand theme restyles them via the @govcore/theme tokens nextkit already uses.
//
// Exposed on the `@govcore/content/screens` subpath, not the main entry, so
// server-only consumers (generated actions, the compiler) never pull in React.

import type { ReactNode } from 'react'
import { Badge, DataTable, PageHeader, type Column, type PaginationProps } from '@govcore/nextkit'
import { ConfirmButton } from '@govcore/nextkit/client'
import {
  isLinkField,
  isReferenceField,
  isTaxonomyField,
  type ContentTypeDefinition,
  type FieldDefinition,
} from './types'
import { WORKFLOW_STATUSES, type WorkflowStatus } from './workflow'
import { taxonomyNodeColumn } from './taxonomy'

type Row = Record<string, unknown>

/** Engine-owned column whose JS key differs from any field name. */
const STATUS_KEY = 'status'

function humanize(name: string): string {
  return name
    .split('_')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ')
}

function fieldLabel(f: { name: string; label?: string }): string {
  return f.label ?? humanize(f.name)
}

/** The row key a field reads from: `<name>_id` / `<name>_node_id` for FKs, else the name. */
function fieldKey(f: FieldDefinition): string {
  if (isReferenceField(f)) return `${f.name}_id`
  if (isTaxonomyField(f)) return taxonomyNodeColumn(f.name)
  return f.name
}

/** The lifecycle badge tone for a status (unknown → muted). */
export function statusTone(status: unknown): 'default' | 'muted' | 'danger' {
  switch (status as WorkflowStatus) {
    case 'published':
      return 'default'
    case 'archived':
      return 'danger'
    case 'draft':
      return 'muted'
    default:
      return 'muted'
  }
}

// ── Reference display (#61) ─────────────────────────────────────────────────

/**
 * How a `reference` field displays and edits. `options` feeds the ContentForm
 * select (build it from the target type's `list()`); `labels` (id → label)
 * feeds list/detail rendering and is derived from `options` when omitted;
 * `hrefBase` links the rendered label to `${hrefBase}/${id}`.
 */
export interface ReferenceDisplay {
  options?: Array<{ value: string; label: string }>
  labels?: Record<string, string>
  hrefBase?: string
}

/** Keyed by the reference **field name** (`account`), not its `account_id` column. */
export type ReferenceDisplayMap = Record<string, ReferenceDisplay>

function refLabel(display: ReferenceDisplay | undefined, id: string): string {
  return (
    display?.labels?.[id] ??
    display?.options?.find((o) => o.value === id)?.label ??
    `${id.slice(0, 8)}…`
  )
}

/** Render a reference value: label (linked when hrefBase is set); `—` for null. */
function renderRefValue(display: ReferenceDisplay | undefined, value: unknown): ReactNode {
  if (value == null || value === '') return '—'
  const id = String(value)
  const label = refLabel(display, id)
  return display?.hrefBase ? (
    <a className="text-primary hover:underline" href={`${display.hrefBase}/${id}`}>
      {label}
    </a>
  ) : (
    label
  )
}

/** The field whose value titles a row in lists/detail — the first text field. */
function primaryField(def: ContentTypeDefinition): FieldDefinition | undefined {
  return def.fields.find((f) => f.type === 'text') ?? def.fields.find((f) => f.type === 'textarea')
}

/**
 * Derive the DataTable columns for a content type: a column per non-`link` field
 * (references read `<name>_id`), each computed field, and the lifecycle `status`
 * rendered as a Badge. With `basePath`, the primary (first text) field links each
 * row to its detail page at `${basePath}/${id}`.
 */
export function contentColumns(
  def: ContentTypeDefinition,
  opts: { basePath?: string; references?: ReferenceDisplayMap; columns?: string[] } = {},
): Column<Row>[] {
  const primary = primaryField(def)
  // Column curation: when `columns` is given, show only those field/computed
  // names (in that order) — wide types otherwise render every field and push the
  // Actions column off-screen. `status` is always kept as the trailing badge.
  const include = opts.columns ? new Set(opts.columns) : null
  const columns: Column<Row>[] = []

  for (const f of def.fields) {
    if (isLinkField(f)) continue // to-many has no column on the row
    if (include && !include.has(f.name)) continue
    const key = fieldKey(f)
    const isPrimary = primary?.name === f.name
    const refDisplay = isReferenceField(f) ? opts.references?.[f.name] : undefined
    columns.push({
      key,
      header: fieldLabel(f),
      cell:
        isPrimary && opts.basePath
          ? (row) => (
              <a className="font-medium text-primary hover:underline" href={`${opts.basePath}/${String(row.id ?? '')}`}>
                {String(row[key] ?? '')}
              </a>
            )
          : isReferenceField(f) && opts.references
            ? (row) => renderRefValue(refDisplay, row[key])
            : undefined,
    })
  }

  for (const c of def.computed ?? []) {
    if (include && !include.has(c.name)) continue
    columns.push({ key: c.name, header: fieldLabel(c) })
  }

  columns.push({
    key: STATUS_KEY,
    header: 'Status',
    cell: (row) => <Badge tone={statusTone(row.status)}>{String(row.status ?? '')}</Badge>,
  })

  return columns
}

/** A form input the engine derives from a field. `kind` maps to an HTML control. */
export interface ContentFormField {
  /** The form/row key (`<name>_id` for references, `<name>_node_id` for taxonomy). */
  name: string
  label: string
  required: boolean
  kind: 'text' | 'textarea' | 'number' | 'checkbox' | 'date' | 'reference' | 'taxonomy'
  /** For `reference`/`taxonomy`: the source field name (the ReferenceDisplayMap key). */
  field?: string
}

const SCALAR_KIND: Record<string, ContentFormField['kind']> = {
  text: 'text',
  textarea: 'textarea',
  number: 'number',
  boolean: 'checkbox',
  date: 'date',
}

/**
 * Derive the editable form fields for a content type. Scalar fields map to their
 * HTML control; `reference` becomes a uuid input named `<name>_id`. Computed,
 * `link`, and `taxonomy` fields are excluded — they aren't directly user-entered.
 */
export function contentFormFields(def: ContentTypeDefinition): ContentFormField[] {
  const fields: ContentFormField[] = []
  for (const f of def.fields) {
    if (isReferenceField(f)) {
      fields.push({ name: `${f.name}_id`, label: fieldLabel(f), required: !!f.required, kind: 'reference', field: f.name })
    } else if (isTaxonomyField(f)) {
      fields.push({ name: taxonomyNodeColumn(f.name), label: fieldLabel(f), required: !!f.required, kind: 'taxonomy', field: f.name })
    } else if (SCALAR_KIND[f.type]) {
      fields.push({ name: f.name, label: fieldLabel(f), required: !!f.required, kind: SCALAR_KIND[f.type] })
    }
    // link: rendered via its own picker, not a direct input here
  }
  return fields
}

// ── Screens ───────────────────────────────────────────────────────────────

/** A dropdown filter over one field's values (the base list-view contract). */
export interface ContentListFilter {
  /** The row key to filter on — a scalar field name, or `<name>_id` for a reference. */
  field: string
  label: string
  options: Array<{ value: string; label: string }>
}

function actionLinkClass(): string {
  return 'inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-muted'
}

/** A server action a row Delete posts to (the id rides along in a hidden input). */
export type ContentDeleteAction = (formData: FormData) => void | Promise<void>

/**
 * The per-row View/Edit/Delete actions column (dedicated routes: detail + edit
 * pages). View is always shown; Edit is gated by `canEdit` + `rowEditable`;
 * Delete is shown only when `canDelete` + a `deleteAction` are given (+ optional
 * `rowDeletable`), and confirms before posting via the client `ConfirmButton`.
 */
function rowActionsColumn(
  basePath: string,
  opts: {
    canEdit?: boolean
    rowEditable?: (row: Row) => boolean
    canDelete?: boolean
    rowDeletable?: (row: Row) => boolean
    deleteAction?: ContentDeleteAction
    singular?: string
  },
): Column<Row> {
  return {
    key: '__actions',
    header: 'Actions',
    cell: (row) => {
      const id = String(row.id ?? '')
      const editable = opts.canEdit && (opts.rowEditable ? opts.rowEditable(row) : true)
      const deletable =
        opts.canDelete && !!opts.deleteAction && (opts.rowDeletable ? opts.rowDeletable(row) : true)
      return (
        <div className="flex justify-end gap-1">
          <a href={`${basePath}/${id}`} className={actionLinkClass()}>
            View
          </a>
          {editable ? (
            <a href={`${basePath}/${id}/edit`} className={actionLinkClass()}>
              Edit
            </a>
          ) : null}
          {deletable ? (
            <form action={opts.deleteAction} className="inline">
              <input type="hidden" name="id" value={id} />
              <ConfirmButton
                message={`Delete this ${opts.singular ?? 'item'}? This cannot be undone.`}
                className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
              >
                Delete
              </ConfirmButton>
            </form>
          ) : null}
        </div>
      )
    },
  }
}

/** Read a row's value for a filter field (`<name>_id` references match on the id column). */
function matchesFilter(row: Row, field: string, value: string): boolean {
  return String(row[field] ?? '') === value
}

/**
 * The list-view toolbar: a GET `<form>` (no client JS) with a search box and a
 * select per filter. Submitting reloads the route with the query in the URL —
 * shareable and RSC-pure. `Clear` links back to the unfiltered list.
 */
function ContentListToolbar({
  basePath,
  label,
  searchable,
  filters,
  query,
}: {
  basePath?: string
  label: string
  searchable: boolean
  filters: ContentListFilter[]
  query: Record<string, string>
}) {
  const active = !!query.q || filters.some((f) => query[f.field] && query[f.field] !== 'all')
  return (
    <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
      {searchable ? (
        <input
          type="search"
          name="q"
          defaultValue={query.q ?? ''}
          placeholder={`Search ${label.toLowerCase()}…`}
          className="h-9 w-56 rounded-md border border-border bg-background px-3 text-sm text-foreground"
        />
      ) : null}
      {filters.map((f) => (
        <select
          key={f.field}
          name={f.field}
          defaultValue={query[f.field] ?? 'all'}
          aria-label={f.label}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
        >
          <option value="all">{f.label}: all</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
      <button
        type="submit"
        className="h-9 rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-muted"
      >
        Filter
      </button>
      {active && basePath ? (
        <a href={basePath} className="h-9 px-2 text-sm text-muted-foreground hover:text-foreground">
          Clear
        </a>
      ) : null}
    </form>
  )
}

function NewButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
    >
      + New {label}
    </a>
  )
}

/**
 * List screen — the base list-view contract (parity with the hand-written app
 * tables): a header with a **New** button, an optional search/filter toolbar,
 * the type's `DataTable` with a per-row **View/Edit** actions column, and an
 * **empty-state CTA**. RSC-pure and dedicated-route based — View links to
 * `${basePath}/${id}`, Edit to `${basePath}/${id}/edit`, New to `newHref`.
 * Search/filters run over the passed `rows` from the current `query`
 * (searchParams); wire them into your `list()` query for very large sets.
 * Actions/edit are gated by `canEdit` and the optional per-row `rowEditable`
 * (e.g. own-org vs federated).
 */
export function ContentListScreen({
  def,
  rows,
  basePath,
  title,
  description,
  references,
  pagination,
  newHref,
  canEdit,
  rowEditable,
  canDelete,
  rowDeletable,
  deleteAction,
  columns,
  searchable,
  filters = [],
  query = {},
}: {
  def: ContentTypeDefinition
  rows: Row[]
  basePath?: string
  title?: string
  description?: string
  references?: ReferenceDisplayMap
  /** Pass through from `listPage` + `parsePageParams` to paginate the list. */
  pagination?: PaginationProps
  /** Create route (e.g. `${basePath}/new`). Set to show the New button + empty CTA action. */
  newHref?: string
  /** Whether the actor may edit — gates the row Edit action. */
  canEdit?: boolean
  /** Per-row edit gate on top of `canEdit` (ownership/federation). Default: editable. */
  rowEditable?: (row: Row) => boolean
  /** Whether the actor may delete — gates the row Delete action (needs `deleteAction`). */
  canDelete?: boolean
  /** Per-row delete gate on top of `canDelete` (ownership/federation). Default: deletable. */
  rowDeletable?: (row: Row) => boolean
  /** Server action the row Delete posts to (id in a hidden field); confirms first. */
  deleteAction?: ContentDeleteAction
  /** Curate which field/computed columns show (ordered). Omit for all; `status` is always kept. */
  columns?: string[]
  /** Show the search box (matches the primary text field). */
  searchable?: boolean
  /** Dropdown filters over field values. */
  filters?: ContentListFilter[]
  /** Current search/filter state from the route's searchParams (`{ q, <field> }`). */
  query?: Record<string, string>
}) {
  const label = title ?? def.label ?? humanize(def.name)
  const singular = def.label ?? humanize(def.name)

  // The type is genuinely empty (not a filtered-away result) → empty-state CTA.
  if (rows.length === 0) {
    return (
      <div>
        <div className="mb-6 flex items-start justify-between gap-4">
          <PageHeader title={label} description={description} />
          {newHref ? <NewButton href={newHref} label={singular} /> : null}
        </div>
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">No {label.toLowerCase()} yet.</p>
          {newHref ? (
            <div className="mt-4 flex justify-center">
              <NewButton href={newHref} label={singular} />
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  const q = (query.q ?? '').toLowerCase().trim()
  const primary = primaryField(def)
  let shown = rows
  if (q && primary) {
    shown = shown.filter((r) => String(r[primary.name] ?? '').toLowerCase().includes(q))
  }
  for (const f of filters) {
    const v = query[f.field]
    if (v && v !== 'all') shown = shown.filter((r) => matchesFilter(r, f.field, v))
  }

  const tableColumns = contentColumns(def, { basePath, references, columns })
  if (basePath) {
    tableColumns.push(
      rowActionsColumn(basePath, {
        canEdit,
        rowEditable,
        canDelete,
        rowDeletable,
        deleteAction,
        singular,
      }),
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <PageHeader title={label} description={description} />
        {newHref ? <NewButton href={newHref} label={singular} /> : null}
      </div>
      {searchable || filters.length > 0 ? (
        <ContentListToolbar
          basePath={basePath}
          label={label}
          searchable={!!searchable}
          filters={filters}
          query={query}
        />
      ) : null}
      <DataTable
        columns={tableColumns}
        rows={shown}
        empty={`No matching ${label.toLowerCase()}.`}
        pagination={pagination}
      />
    </div>
  )
}

/**
 * Detail screen: the row's primary value as the heading, a lifecycle status
 * badge, and a definition list of every field/computed value. Pass a row from
 * the generated `get()` action.
 */
export function ContentDetailScreen({
  def,
  row,
  title,
  references,
  actions,
}: {
  def: ContentTypeDefinition
  row: Row
  title?: string
  references?: ReferenceDisplayMap
  /** Header slot for an Edit link, publish button, etc. */
  actions?: ReactNode
}) {
  const primary = primaryField(def)
  const primaryValue = primary ? String(row[primary.name] ?? '') : ''
  const heading = title ?? (primaryValue || def.label || humanize(def.name))
  const entries = contentColumns(def, { references }).filter((c) => c.key !== STATUS_KEY)

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
        <Badge tone={statusTone(row.status)}>{String(row.status ?? '')}</Badge>
        {actions ? <div className="ml-auto">{actions}</div> : null}
      </div>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
        {entries.map((c) => (
          <div key={c.key}>
            <dt className="text-sm text-muted-foreground">{c.header}</dt>
            <dd className="mt-0.5 text-foreground">{c.cell ? c.cell(row) : String(row[c.key] ?? '')}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** A server action a `ContentForm` posts to — a URL or a server function. */
export type ContentFormAction = string | ((formData: FormData) => void | Promise<void>)

function inputClass(): string {
  return 'mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground'
}

/**
 * Create/edit form: a plain `<form action={action}>` with an input per editable
 * field (see `contentFormFields`), prefilled from `row` when editing. No client
 * hooks — it posts to the server `action` (wrap a generated `create`/`update`).
 * For edit, pass `row` and the row's `id` rides along in a hidden input.
 */
export function ContentForm({
  def,
  action,
  row,
  submitLabel,
  references,
  choices,
}: {
  def: ContentTypeDefinition
  action: ContentFormAction
  row?: Row
  submitLabel?: string
  references?: ReferenceDisplayMap
  /**
   * Enumerated scalar fields (stage, status, type, …), keyed by field name:
   * render a select over these options instead of a free input.
   */
  choices?: Record<string, Array<{ value: string; label: string }>>
}): ReactNode {
  const fields = contentFormFields(def)
  const editing = !!row?.id
  return (
    <form action={action} className="max-w-xl space-y-4">
      {editing ? <input type="hidden" name="id" value={String(row?.id ?? '')} /> : null}
      {fields.map((f) => {
        const value = row?.[f.name]
        const options =
          f.kind === 'reference' && f.field
            ? references?.[f.field]?.options
            : choices?.[f.name]
        return (
          <div key={f.name}>
            <label htmlFor={f.name} className="text-sm font-medium text-foreground">
              {f.label}
              {f.required ? <span className="text-destructive"> *</span> : null}
            </label>
            {options ? (
              <select
                id={f.name}
                name={f.name}
                required={f.required}
                defaultValue={String(value ?? '')}
                className={inputClass()}
              >
                {f.required ? null : <option value="">—</option>}
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.kind === 'textarea' ? (
              <textarea id={f.name} name={f.name} required={f.required} defaultValue={String(value ?? '')} className={inputClass()} rows={4} />
            ) : f.kind === 'checkbox' ? (
              <input id={f.name} name={f.name} type="checkbox" defaultChecked={!!value} className="mt-1 block" />
            ) : (
              <input
                id={f.name}
                name={f.name}
                type={f.kind === 'number' ? 'number' : f.kind === 'date' ? 'date' : 'text'}
                required={f.required}
                defaultValue={String(value ?? '')}
                className={inputClass()}
              />
            )}
          </div>
        )
      })}
      <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
        {submitLabel ?? (editing ? 'Save' : `Create ${def.label ?? humanize(def.name)}`)}
      </button>
    </form>
  )
}

/**
 * The canonical coercion from a posted ContentForm to a row for the generated
 * `create`/`update` actions: empty optional inputs become `null` (uuid, date,
 * and numeric columns reject `''`), checkboxes become booleans, values are
 * trimmed, and keys outside the form-field set are ignored.
 */
export function parseContentForm(def: ContentTypeDefinition, formData: FormData): Row {
  const row: Row = {}
  for (const f of contentFormFields(def)) {
    if (f.kind === 'checkbox') {
      row[f.name] = formData.get(f.name) === 'on'
      continue
    }
    const raw = formData.get(f.name)
    const value = typeof raw === 'string' ? raw.trim() : ''
    row[f.name] = value === '' ? (f.required ? '' : null) : value
  }
  return row
}

/** The lifecycle states a content type can be in — handy for status filters. */
export const CONTENT_STATUSES = WORKFLOW_STATUSES
