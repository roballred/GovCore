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
  opts: { basePath?: string; references?: ReferenceDisplayMap } = {},
): Column<Row>[] {
  const primary = primaryField(def)
  const columns: Column<Row>[] = []

  for (const f of def.fields) {
    if (isLinkField(f)) continue // to-many has no column on the row
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

/**
 * List screen: a `PageHeader` over the type's `DataTable`. Pass rows from the
 * generated `list()` action; `basePath` makes each row link to its detail page.
 */
export function ContentListScreen({
  def,
  rows,
  basePath,
  title,
  description,
  references,
  pagination,
}: {
  def: ContentTypeDefinition
  rows: Row[]
  basePath?: string
  title?: string
  description?: string
  references?: ReferenceDisplayMap
  /** Pass through from `listPage` + `parsePageParams` to paginate the list. */
  pagination?: PaginationProps
}) {
  const label = title ?? def.label ?? humanize(def.name)
  return (
    <div>
      <PageHeader title={label} description={description} />
      <DataTable
        columns={contentColumns(def, { basePath, references })}
        rows={rows}
        empty={`No ${label.toLowerCase()} yet.`}
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
