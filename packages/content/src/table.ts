// @govcore/content/table — build runtime Drizzle tables from a definition.
//
// `buildContentTable` mirrors the main table the compiler emits (Rule 1) plus
// `reference` FK columns (`<name>_id`, Rule 2). `buildLinkTable` mirrors the
// junction the compiler emits for a `link` field. Column names match the DDL
// exactly, so generated types query with the same db API as hand-written ones.

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
import {
  isLinkField,
  isReferenceField,
  isScalarField,
  type ContentTypeDefinition,
  type ScalarFieldType,
} from './types'
import { DEFAULT_CONTENT_SCHEMA, linkJunctionName } from './compile'
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
 * Build the Drizzle table for a content type: engine-owned columns (`id`,
 * `organization_id`, `status`, timestamps), a column per scalar field, and a
 * `<name>_id` uuid per `reference` field. `link` fields have no column here —
 * use `buildLinkTable`. Throws on a `taxonomy` field (a later slice).
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
    if (isScalarField(f)) {
      columns[f.name] = scalarBuilder(f.name, f.type, f.required)
    } else if (isReferenceField(f)) {
      const col = uuid(`${f.name}_id`)
      columns[`${f.name}Id`] = f.required ? col.notNull() : col
    } else if (isLinkField(f)) {
      continue // to-many lives in a junction table
    } else {
      throw new Error(
        `buildContentTable("${def.name}"): field "${f.name}" type "${f.type}" is not supported yet`,
      )
    }
  }

  return s.table(def.name, columns)
}

/**
 * Build the Drizzle junction table for a `link` field: `(source_id, target_id,
 * organization_id, created_at)`. Mirrors the compiler's junction DDL.
 */
export function buildLinkTable(
  def: ContentTypeDefinition,
  fieldName: string,
  opts: { schema?: string } = {},
) {
  const s = pgSchema(opts.schema ?? DEFAULT_CONTENT_SCHEMA)
  return s.table(linkJunctionName(def.name, fieldName), {
    sourceId: uuid('source_id').notNull(),
    targetId: uuid('target_id').notNull(),
    organizationId: uuid('organization_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  })
}
