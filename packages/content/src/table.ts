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
  isTaxonomyField,
  type ContentTypeDefinition,
  type ScalarFieldType,
} from './types'
import { DEFAULT_CONTENT_SCHEMA, linkJunctionName } from './compile'
import { DEFAULT_WORKFLOW_STATUS } from './workflow'
import { TAXONOMY_NODES_TABLE, taxonomyNodeColumn } from './taxonomy'

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
      // JS key mirrors the column name (snake_case), like scalar fields.
      const col = uuid(`${f.name}_id`)
      columns[`${f.name}_id`] = f.required ? col.notNull() : col
    } else if (isLinkField(f)) {
      continue // to-many lives in a junction table
    } else if (isTaxonomyField(f)) {
      // Files under a taxonomy_nodes row; JS key mirrors the column name.
      const key = taxonomyNodeColumn(f.name)
      const col = uuid(key)
      columns[key] = f.required ? col.notNull() : col
    } else {
      throw new Error(
        `buildContentTable("${def.name}"): field "${f.name}" type "${f.type}" is not supported yet`,
      )
    }
  }
  // Materialized computed fields carry a real (nullable) column.
  for (const c of def.computed ?? []) {
    if (c.materialized) columns[c.name] = scalarBuilder(c.name, c.type, false)
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

/**
 * Build the Drizzle table for the engine-owned `taxonomy_nodes` — the shared
 * classification table a `taxonomy` field files into. Mirrors `taxonomySchemaDdl`.
 * Insert/query nodes through this; `buildTree` turns the rows into a hierarchy.
 */
export function buildTaxonomyTable(opts: { schema?: string } = {}) {
  const s = pgSchema(opts.schema ?? DEFAULT_CONTENT_SCHEMA)
  return s.table(TAXONOMY_NODES_TABLE, {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    tree: text('tree').notNull(),
    parentId: uuid('parent_id'),
    label: text('label').notNull(),
    slug: text('slug').notNull(),
    sort: numeric('sort').notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  })
}
