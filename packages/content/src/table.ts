// @govcore/content/table — build a runtime Drizzle table from a definition.
//
// The compiler (compile.ts) emits the DDL that creates the table; this builds
// the matching Drizzle table object so generated types are queryable with the
// same `db.select()/insert()` API as hand-written tables (Rule 1: "indistinguishable
// from one a human would have hand-written"). Column names mirror the DDL exactly.

import {
  boolean,
  date,
  numeric,
  pgSchema,
  text,
  timestamp,
  uuid,
  type PgColumnBuilderBase,
} from 'drizzle-orm/pg-core'
import { isScalarField, type ContentTypeDefinition, type ScalarFieldType } from './types'
import { DEFAULT_CONTENT_SCHEMA } from './compile'
import { DEFAULT_WORKFLOW_STATUS } from './workflow'

function scalarBuilder(name: string, type: ScalarFieldType, required = false): PgColumnBuilderBase {
  const base =
    type === 'number'
      ? numeric(name)
      : type === 'boolean'
        ? boolean(name)
        : type === 'date'
          ? date(name)
          : text(name) // text + textarea
  return required ? base.notNull() : base
}

/**
 * Build the Drizzle table for a content type. Carries the engine-owned columns
 * (`id`, `organization_id`, `status`, timestamps) plus a column per declared
 * scalar field, in the configured schema. Throws on a relationship field (Rule 2).
 */
export function buildContentTable(def: ContentTypeDefinition, opts: { schema?: string } = {}) {
  const s = pgSchema(opts.schema ?? DEFAULT_CONTENT_SCHEMA)

  const columns: Record<string, PgColumnBuilderBase> = {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    status: text('status').notNull().default(DEFAULT_WORKFLOW_STATUS),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  }
  for (const f of def.fields) {
    if (!isScalarField(f)) {
      throw new Error(
        `buildContentTable("${def.name}"): field "${f.name}" type "${f.type}" is a relationship — not supported yet (Rule 2)`,
      )
    }
    columns[f.name] = scalarBuilder(f.name, f.type, f.required)
  }

  return s.table(def.name, columns)
}
