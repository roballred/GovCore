// @govcore/content/actions — generate a content type's CRUD as tenantActions.
//
// Appendix B: "generated actions are tenantActions (§6.2)." Each generated action
// runs through the app's own `tenantAction`, so it resolves the actor's active
// org (never trusting input), opens a transaction with the `app.current_org` GUC
// (RLS binds to every query), and audits in-transaction. create/update keep the
// materialized computed columns current; publish/archive delegate to the Rule 3
// `transition` engine so the lifecycle hooks fire.

import { count, eq } from 'drizzle-orm'
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core'
import type { GovcoreDb } from '@govcore/schema'
import type { TenantActionContext, TenantActionOptions } from '@govcore/server'
import type { ContentTypeDefinition } from './types'
import { materializedValues, recompute } from './computed'
import { transition } from './hooks'

type Row = Record<string, unknown>

/** The shape of an app's `tenantAction` (the return of `createTenantActions`). */
export type TenantAction = <I, O>(
  options: TenantActionOptions,
  handler: (args: { ctx: TenantActionContext; db: GovcoreDb }, input: I) => Promise<O>,
) => (input: I) => Promise<O>

export interface ContentActionPermissions {
  create?: string
  update?: string
  remove?: string
  publish?: string
}

export interface GenerateContentActionsOptions {
  permissions?: ContentActionPermissions
}

/** One page of list results: the slice plus the unpaginated total (for the count/last-page math). */
export interface ContentPage {
  rows: Row[]
  total: number
  page: number
  pageSize: number
}

const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100

export interface ContentActions {
  create: (input: Row) => Promise<Row>
  update: (input: { id: string; values: Row }) => Promise<Row | null>
  get: (input: { id: string }) => Promise<Row | null>
  list: (input?: void) => Promise<Row[]>
  /** A single page of rows plus the total count — for a paginated list view. */
  listPage: (input: { page?: number; pageSize?: number }) => Promise<ContentPage>
  remove: (input: { id: string }) => Promise<void>
  publish: (input: { id: string }) => Promise<Row>
  archive: (input: { id: string }) => Promise<Row>
}

/**
 * Generate the CRUD + lifecycle actions for a content type, each wrapped in the
 * app's `tenantAction`. Org scoping, RLS, and audit come from `tenantAction`;
 * this fills in the per-type body.
 */
export function generateContentActions(
  tenantAction: TenantAction,
  def: ContentTypeDefinition,
  table: PgTable,
  options: GenerateContentActionsOptions = {},
): ContentActions {
  const perms = options.permissions ?? {}
  const idCol = (table as unknown as Record<string, AnyPgColumn>).id

  const create = tenantAction<Row, Row>({ permission: perms.create }, async ({ ctx, db }, input) => {
    // Org always comes from the trusted context, never the input.
    const base: Row = { ...input, organizationId: ctx.organizationId }
    const [row] = await db
      .insert(table)
      .values({ ...base, ...materializedValues(def, base) })
      .returning()
    await ctx.audit({ action: `content.${def.name}.create`, entityType: def.name, entityId: (row as Row).id as string, after: input })
    return row as Row
  })

  const update = tenantAction<{ id: string; values: Row }, Row | null>(
    { permission: perms.update },
    async ({ ctx, db }, { id, values }) => {
      await db.update(table).set({ ...values, updatedAt: new Date() }).where(eq(idCol, id))
      await recompute(db, table, def, id) // refresh materialized from the new row
      const [row] = await db.select().from(table).where(eq(idCol, id)).limit(1)
      await ctx.audit({ action: `content.${def.name}.update`, entityType: def.name, entityId: id, after: values })
      return (row as Row) ?? null
    },
  )

  const get = tenantAction<{ id: string }, Row | null>({}, async ({ db }, { id }) => {
    const [row] = await db.select().from(table).where(eq(idCol, id)).limit(1)
    return (row as Row) ?? null
  })

  const list = tenantAction<void, Row[]>({}, async ({ db }) => {
    return (await db.select().from(table)) as Row[]
  })

  const listPage = tenantAction<{ page?: number; pageSize?: number }, ContentPage>(
    {},
    async ({ db }, input) => {
      // Clamp the same way nextkit's parsePageParams does: a bad page/pageSize
      // can never produce a negative offset or an unbounded query.
      const page = Math.max(1, Math.trunc(input?.page ?? 1) || 1)
      const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(input?.pageSize ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE))
      const rows = (await db.select().from(table).limit(pageSize).offset((page - 1) * pageSize)) as Row[]
      const [totals] = await db.select({ c: count() }).from(table)
      return { rows, total: Number(totals?.c ?? 0), page, pageSize }
    },
  )

  const remove = tenantAction<{ id: string }, void>(
    { permission: perms.remove },
    async ({ ctx, db }, { id }) => {
      await db.delete(table).where(eq(idCol, id))
      await ctx.audit({ action: `content.${def.name}.delete`, entityType: def.name, entityId: id })
    },
  )

  const publish = tenantAction<{ id: string }, Row>({ permission: perms.publish }, async ({ db }, { id }) => {
    return transition(db, table, def, { id, to: 'published' })
  })

  const archive = tenantAction<{ id: string }, Row>({ permission: perms.publish }, async ({ db }, { id }) => {
    return transition(db, table, def, { id, to: 'archived' })
  })

  return { create, update, get, list, listPage, remove, publish, archive }
}
