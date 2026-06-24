// @govcore/content/types — the content-type definition model.
//
// A content type is described as data (promoted from the @govea/core
// `content-types` stub). `defineContentType` validates the description so the
// compiler and table builder downstream can trust it: identifiers are
// snake_case, field names are unique and don't collide with the engine-reserved
// columns. Relationship field types (`reference`, `taxonomy`) are part of the
// vocabulary but are a later slice (Rule 2) — the compiler rejects them for now.

/** Scalar field types the compiler can emit today. */
export const SCALAR_FIELD_TYPES = ['text', 'textarea', 'number', 'boolean', 'date'] as const
export type ScalarFieldType = (typeof SCALAR_FIELD_TYPES)[number]

/**
 * Relationship field types. `reference` (to-one) and `link` (to-many through a
 * generated junction) are implemented; `taxonomy` is a later slice.
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
  /** For `taxonomy` — the tree name. Unused until the taxonomy slice. */
  tree?: string
}

export interface ContentTypeDefinition {
  name: string
  label?: string
  fields: FieldDefinition[]
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
