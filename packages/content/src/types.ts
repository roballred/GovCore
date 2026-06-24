// @govcore/content/types — the content-type definition model.
//
// A content type is described as data (promoted from the @govea/core
// `content-types` stub). `defineContentType` validates the description so the
// compiler and table builder downstream can trust it: identifiers are
// snake_case, field names are unique and don't collide with the engine-reserved
// columns. Relationship field types — `reference` (to-one), `link` (to-many),
// and `taxonomy` (filed under a classification tree) — are all first-class.

/** Scalar field types the compiler can emit today. */
export const SCALAR_FIELD_TYPES = ['text', 'textarea', 'number', 'boolean', 'date'] as const
export type ScalarFieldType = (typeof SCALAR_FIELD_TYPES)[number]

/**
 * Relationship field types. `reference` (to-one) and `link` (to-many through a
 * generated junction); `taxonomy` files the row under a node of a classification
 * tree (a `<name>_node_id` FK into the engine-owned `taxonomy_nodes` table).
 */
export const RELATIONSHIP_FIELD_TYPES = ['reference', 'link', 'taxonomy'] as const
export type RelationshipFieldType = (typeof RELATIONSHIP_FIELD_TYPES)[number]

export type FieldType = ScalarFieldType | RelationshipFieldType

export interface FieldDefinition {
  name: string
  type: FieldType
  required?: boolean
  label?: string
  /** For `reference`/`link` — the target content type's name. Required for those. */
  to?: string
  /** For `taxonomy` — the classification tree this field files the row under. Required. */
  tree?: string
}

/**
 * A derived field, backed by a pure function the engine calls (Rule 2). When
 * `materialized`, the value is stored in a real column and refreshed by
 * `recompute`; otherwise it is computed on read (`withComputed`).
 */
export interface ComputedFieldDefinition {
  name: string
  /** Scalar type of the computed value (also the materialized column type). */
  type: ScalarFieldType
  /** Pure function of the stored row → the derived value. */
  compute: (row: Record<string, unknown>) => unknown
  /** Store the value in a real column, refreshed on demand. Defaults to false (on-read). */
  materialized?: boolean
  label?: string
}

export interface ContentTypeDefinition {
  name: string
  label?: string
  fields: FieldDefinition[]
  computed?: ComputedFieldDefinition[]
  /** Per-type hooks (Rule 3) — the escape hatch to real code. */
  hooks?: import('./hooks').ContentHooks
}

/** Columns the engine owns on every compiled table; field names may not collide. */
export const RESERVED_FIELD_NAMES = [
  'id',
  'organization_id',
  'status',
  'created_at',
  'updated_at',
] as const

const IDENTIFIER = /^[a-z][a-z0-9_]*$/
const ALL_FIELD_TYPES: FieldType[] = [...SCALAR_FIELD_TYPES, ...RELATIONSHIP_FIELD_TYPES]

/**
 * Validate and return a content-type definition. Throws on an invalid type name,
 * a bad/duplicate/reserved field name, or an unknown field type — so the
 * compiler and table builder can assume a well-formed definition.
 */
export function defineContentType(def: ContentTypeDefinition): ContentTypeDefinition {
  if (!IDENTIFIER.test(def.name)) {
    throw new Error(
      `defineContentType: type name "${def.name}" must be snake_case (start with a letter, [a-z0-9_])`,
    )
  }
  if (def.fields.length === 0) {
    throw new Error(`defineContentType("${def.name}"): at least one field is required`)
  }

  const seen = new Set<string>()
  for (const f of def.fields) {
    if (!IDENTIFIER.test(f.name)) {
      throw new Error(`defineContentType("${def.name}"): field "${f.name}" must be snake_case`)
    }
    if ((RESERVED_FIELD_NAMES as readonly string[]).includes(f.name)) {
      throw new Error(
        `defineContentType("${def.name}"): field "${f.name}" is reserved by the engine`,
      )
    }
    if (seen.has(f.name)) {
      throw new Error(`defineContentType("${def.name}"): duplicate field "${f.name}"`)
    }
    seen.add(f.name)
    if (!ALL_FIELD_TYPES.includes(f.type)) {
      throw new Error(`defineContentType("${def.name}"): field "${f.name}" has unknown type "${f.type}"`)
    }
    if ((f.type === 'reference' || f.type === 'link') && !IDENTIFIER.test(f.to ?? '')) {
      throw new Error(
        `defineContentType("${def.name}"): ${f.type} field "${f.name}" needs a snake_case "to" (target content type)`,
      )
    }
    if (f.type === 'taxonomy' && !(f.tree ?? '').trim()) {
      throw new Error(
        `defineContentType("${def.name}"): taxonomy field "${f.name}" needs a "tree" (the classification tree name)`,
      )
    }
  }

  // Computed fields share the row/column namespace — reject collisions.
  const columnNames = new Set<string>(RESERVED_FIELD_NAMES)
  for (const f of def.fields) {
    // The real column a field maps to (link lives in a junction → no column).
    const col =
      f.type === 'reference'
        ? `${f.name}_id`
        : f.type === 'taxonomy'
          ? `${f.name}_node_id`
          : f.type === 'link'
            ? null
            : f.name
    if (col === null) continue
    if (columnNames.has(col)) {
      throw new Error(
        `defineContentType("${def.name}"): field "${f.name}" maps to column "${col}", which collides with an existing column`,
      )
    }
    columnNames.add(col)
  }
  for (const c of def.computed ?? []) {
    if (!IDENTIFIER.test(c.name)) {
      throw new Error(`defineContentType("${def.name}"): computed field "${c.name}" must be snake_case`)
    }
    if (columnNames.has(c.name)) {
      throw new Error(
        `defineContentType("${def.name}"): computed field "${c.name}" collides with an existing column`,
      )
    }
    if (!(SCALAR_FIELD_TYPES as readonly string[]).includes(c.type)) {
      throw new Error(
        `defineContentType("${def.name}"): computed field "${c.name}" has unknown type "${c.type}"`,
      )
    }
    if (typeof c.compute !== 'function') {
      throw new Error(`defineContentType("${def.name}"): computed field "${c.name}" needs a compute function`)
    }
    columnNames.add(c.name)
  }
  return def
}

export function isScalarField(f: FieldDefinition): f is FieldDefinition & { type: ScalarFieldType } {
  return (SCALAR_FIELD_TYPES as readonly string[]).includes(f.type)
}

export function isReferenceField(f: FieldDefinition): f is FieldDefinition & { to: string } {
  return f.type === 'reference'
}

export function isLinkField(f: FieldDefinition): f is FieldDefinition & { to: string } {
  return f.type === 'link'
}

export function isTaxonomyField(f: FieldDefinition): f is FieldDefinition & { tree: string } {
  return f.type === 'taxonomy'
}
