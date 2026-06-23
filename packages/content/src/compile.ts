// @govcore/content/compile — the definition → DDL compiler (Rules 1 & 2).
//
// Rule 1: a content type compiles into a REAL table + migration — real columns,
// types, indexes, FKs, org scope, and the same Row-Level Security as a
// hand-written platform table — never an EAV blob.
//
// Rule 2 (relationships): `reference` (to-one) becomes a real `<name>_id` FK
// column; `link` (to-many) generates a real junction table (also org-scoped and
// RLS-bound). The emitted SQL joins the migration stream and is applied by
// govcore-migrate. A reference/link target table must be compiled & applied
// first (declare types in dependency order).

import {
  isLinkField,
  isReferenceField,
  isScalarField,
  type ContentTypeDefinition,
  type FieldDefinition,
  type ScalarFieldType,
} from './types'
import { WORKFLOW_STATUSES, DEFAULT_WORKFLOW_STATUS } from './workflow'

/** Schema that generated content tables live in (kept apart from `govcore`). */
export const DEFAULT_CONTENT_SCHEMA = 'content'

export interface CompileOptions {
  /** Postgres schema for the generated table. Defaults to `content`. */
  schema?: string
}

export interface CompiledJunction {
  field: string
  tableName: string
}

export interface CompiledContentType {
  schema: string
  tableName: string
  /** Link junction tables generated for this type's `link` fields. */
  junctions: CompiledJunction[]
  /** Full migration DDL: table + reference indexes + RLS + any link junctions. Idempotent. */
  sql: string
}

/** Postgres column type for each scalar field type. */
const PG_TYPE: Record<ScalarFieldType, string> = {
  text: 'text',
  textarea: 'text',
  number: 'numeric',
  boolean: 'boolean',
  date: 'date',
}

const GUC = `nullif(current_setting('app.current_org', true), '')::uuid`

/** The junction table name for a `link` field (double underscore avoids clashes). */
export function linkJunctionName(typeName: string, fieldName: string): string {
  return `${typeName}__${fieldName}`
}

/** RLS block (ENABLE + FORCE + org-GUC policy) for a generated table. */
function rlsBlock(qualified: string, policy: string): string {
  return `ALTER TABLE ${qualified} ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${qualified} FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ${policy} ON ${qualified};
CREATE POLICY ${policy} ON ${qualified}
  USING (organization_id = ${GUC})
  WITH CHECK (organization_id = ${GUC});`
}

/** DDL for one `link` field's junction table. */
function junctionDdl(schema: string, def: ContentTypeDefinition, f: FieldDefinition & { to: string }): string {
  const name = linkJunctionName(def.name, f.name)
  const jt = `${schema}.${name}`
  return `CREATE TABLE IF NOT EXISTS ${jt} (
  source_id uuid NOT NULL REFERENCES ${schema}.${def.name} (id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES ${schema}.${f.to} (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES govcore.organizations (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, target_id)
);

CREATE INDEX IF NOT EXISTS ${name}_organization_id_idx ON ${jt} (organization_id);
CREATE INDEX IF NOT EXISTS ${name}_target_id_idx ON ${jt} (target_id);

${rlsBlock(jt, `${name}_org_isolation`)}`
}

/**
 * Compile a content-type definition into idempotent migration DDL — the table
 * (id, organization_id FK, scalar columns, reference FK columns, status,
 * timestamps, org + reference indexes, FORCEd RLS) plus a junction table per
 * `link` field. Throws on a `taxonomy` field (a later slice).
 */
export function compileContentType(
  def: ContentTypeDefinition,
  opts: CompileOptions = {},
): CompiledContentType {
  const schema = opts.schema ?? DEFAULT_CONTENT_SCHEMA
  const t = `${schema}.${def.name}`

  const columns: string[] = [
    '  id uuid PRIMARY KEY DEFAULT gen_random_uuid()',
    '  organization_id uuid NOT NULL REFERENCES govcore.organizations (id) ON DELETE CASCADE',
  ]
  const referenceIndexes: string[] = []
  const junctions: CompiledJunction[] = []
  const junctionDdls: string[] = []

  for (const f of def.fields) {
    if (isScalarField(f)) {
      columns.push(`  ${f.name} ${PG_TYPE[f.type]}${f.required ? ' NOT NULL' : ''}`)
    } else if (isReferenceField(f)) {
      // Required → RESTRICT (can't orphan a NOT NULL ref); optional → SET NULL.
      const onDelete = f.required ? 'RESTRICT' : 'SET NULL'
      columns.push(
        `  ${f.name}_id uuid${f.required ? ' NOT NULL' : ''} REFERENCES ${schema}.${f.to} (id) ON DELETE ${onDelete}`,
      )
      referenceIndexes.push(
        `CREATE INDEX IF NOT EXISTS ${def.name}_${f.name}_id_idx ON ${t} (${f.name}_id);`,
      )
    } else if (isLinkField(f)) {
      junctions.push({ field: f.name, tableName: linkJunctionName(def.name, f.name) })
      junctionDdls.push(junctionDdl(schema, def, f))
    } else {
      throw new Error(
        `compileContentType("${def.name}"): field "${f.name}" type "${f.type}" is not supported yet`,
      )
    }
  }

  // Materialized computed fields get a real (nullable) column, refreshed by recompute.
  for (const c of def.computed ?? []) {
    if (c.materialized) columns.push(`  ${c.name} ${PG_TYPE[c.type]}`)
  }

  const statusList = WORKFLOW_STATUSES.map((s) => `'${s}'`).join(', ')
  columns.push(`  status text NOT NULL DEFAULT '${DEFAULT_WORKFLOW_STATUS}'`)
  columns.push('  created_at timestamptz NOT NULL DEFAULT now()')
  columns.push('  updated_at timestamptz NOT NULL DEFAULT now()')
  columns.push(`  CONSTRAINT ${def.name}_status_check CHECK (status IN (${statusList}))`)

  const parts = [
    `-- Generated by @govcore/content from content type "${def.name}".`,
    `CREATE SCHEMA IF NOT EXISTS ${schema};`,
    `CREATE TABLE IF NOT EXISTS ${t} (\n${columns.join(',\n')}\n);`,
    `CREATE INDEX IF NOT EXISTS ${def.name}_organization_id_idx ON ${t} (organization_id);`,
    ...referenceIndexes,
    `-- Tenant isolation by the active-org GUC, FORCEd for the non-owner runtime role.`,
    rlsBlock(t, `${def.name}_org_isolation`),
    ...junctionDdls,
  ]

  return { schema, tableName: def.name, junctions, sql: parts.join('\n\n') + '\n' }
}
