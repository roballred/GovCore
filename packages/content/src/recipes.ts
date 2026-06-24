// @govcore/content/recipes — installable per-organization bundles.
//
// Appendix B's fourth engine seed (`applyRecipe`, a TODO in the GovEA seed) made
// real, and the direct continuation of ADR-0002: a framework like TOGAF is *data
// you install*, not *code you ship*. A recipe is a JSON-describable bundle that,
// applied to one organization, installs taxonomy classifications + seed content
// — idempotently, with no migration. It runs inside the caller's tenant
// transaction, so RLS scopes every insert to the active org like everything else.

import { and, eq } from 'drizzle-orm'
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core'
import type { GovcoreDb } from '@govcore/schema'
import type { ContentTypeDefinition } from './types'
import { materializedValues } from './computed'

type Row = Record<string, unknown>

/** A classification node in a recipe — nested children become a parent_id chain. */
export interface RecipeTaxonomyNode {
  slug: string
  label: string
  sort?: number
  children?: RecipeTaxonomyNode[]
}

/** A classification tree to install into `taxonomy_nodes`. */
export interface RecipeTaxonomy {
  tree: string
  nodes: RecipeTaxonomyNode[]
}

/** A reference to an installed taxonomy node, resolved to its id at apply time. */
export interface NodeRef {
  $node: { tree: string; slug: string }
}

export function isNodeRef(v: unknown): v is NodeRef {
  return typeof v === 'object' && v !== null && '$node' in v
}

/** A taxonomy node flattened to install order, carrying its parent's slug. */
export interface FlatTaxonomyNode {
  slug: string
  label: string
  sort?: number
  parentSlug: string | null
}

/** Flatten nested recipe nodes into install order (parents before children). */
export function flattenTaxonomy(nodes: RecipeTaxonomyNode[]): FlatTaxonomyNode[] {
  const out: FlatTaxonomyNode[] = []
  const walk = (level: RecipeTaxonomyNode[], parentSlug: string | null) => {
    for (const n of level) {
      out.push({ slug: n.slug, label: n.label, sort: n.sort, parentSlug })
      if (n.children?.length) walk(n.children, n.slug)
    }
  }
  walk(nodes, null)
  return out
}

/**
 * Resolve a seed row's `{ $node: { tree, slug } }` values to node ids from an
 * installed-node map. Non-ref values pass through; an unresolved ref throws.
 */
export function resolveRowRefs(
  row: Row,
  nodeIds: Record<string, Record<string, string>>,
  recipeName = 'recipe',
): Row {
  const out: Row = {}
  for (const [k, v] of Object.entries(row)) {
    if (isNodeRef(v)) {
      const id = nodeIds[v.$node.tree]?.[v.$node.slug]
      if (!id) {
        throw new Error(
          `applyRecipe("${recipeName}"): row references node ${v.$node.tree}/${v.$node.slug}, which the recipe does not install`,
        )
      }
      out[k] = id
    } else {
      out[k] = v
    }
  }
  return out
}

/** Seed rows for one content type. */
export interface RecipeContent {
  /** The content type name (resolved against the runtime's `types`). */
  type: string
  /** Row values (without org/id). A `{ $node: { tree, slug } }` value files under an installed node. */
  rows: Row[]
  /** Field whose value de-duplicates rows on re-apply (skip if a row with it already exists). */
  dedupeBy?: string
}

/** A JSON-describable bundle installable per organization. */
export interface Recipe {
  name: string
  version?: string
  taxonomies?: RecipeTaxonomy[]
  content?: RecipeContent[]
}

/** What the installer needs to resolve a recipe against real tables. */
export interface RecipeRuntime {
  organizationId: string
  /** The engine-owned `taxonomy_nodes` table (`buildTaxonomyTable`). */
  taxonomyTable: PgTable
  /** Content types the recipe may seed, by name (`buildContentTable` + its definition). */
  types?: Record<string, { def: ContentTypeDefinition; table: PgTable }>
}

export interface AppliedRecipe {
  /** Taxonomy nodes newly inserted (re-applied nodes are not counted). */
  taxonomyNodes: number
  /** Seed content rows newly inserted (deduped rows are not counted). */
  contentRows: number
  /** Every node now present: tree → slug → id (installed or pre-existing). */
  nodeIds: Record<string, Record<string, string>>
}

function col(table: PgTable, name: string): AnyPgColumn {
  return (table as unknown as Record<string, AnyPgColumn>)[name]
}

/**
 * Apply a recipe to one organization: install its taxonomy trees and seed
 * content. Idempotent — taxonomy nodes dedupe on `(org, tree, slug)`, and seed
 * rows skip when a `dedupeBy` match already exists — so re-applying is safe.
 * Runs on the caller's tenant db handle (RLS scopes every write to the org).
 */
export async function applyRecipe(
  db: GovcoreDb,
  recipe: Recipe,
  runtime: RecipeRuntime,
): Promise<AppliedRecipe> {
  const { organizationId, taxonomyTable } = runtime
  const nodeIds: Record<string, Record<string, string>> = {}
  let taxonomyNodes = 0

  for (const tx of recipe.taxonomies ?? []) {
    const map: Record<string, string> = (nodeIds[tx.tree] ??= {})
    for (const n of flattenTaxonomy(tx.nodes)) {
      const parentId = n.parentSlug ? map[n.parentSlug] ?? null : null
      const [inserted] = await db
        .insert(taxonomyTable)
        .values({
          organizationId,
          tree: tx.tree,
          slug: n.slug,
          label: n.label,
          sort: String(n.sort ?? 0),
          parentId,
        } as Row)
        .onConflictDoNothing()
        .returning()

      if (inserted) {
        map[n.slug] = (inserted as Row).id as string
        taxonomyNodes++
      } else {
        // Already installed — read its id back (RLS scopes to the org).
        const [existing] = await db
          .select()
          .from(taxonomyTable)
          .where(and(eq(col(taxonomyTable, 'tree'), tx.tree), eq(col(taxonomyTable, 'slug'), n.slug)))
          .limit(1)
        map[n.slug] = (existing as Row).id as string
      }
    }
  }

  let contentRows = 0
  for (const rc of recipe.content ?? []) {
    const entry = runtime.types?.[rc.type]
    if (!entry) throw new Error(`applyRecipe("${recipe.name}"): unknown content type "${rc.type}"`)
    const { def, table } = entry

    for (const raw of rc.rows) {
      // Resolve { $node } references against the installed taxonomy map.
      const values = resolveRowRefs(raw, nodeIds, recipe.name)

      if (rc.dedupeBy) {
        const [existing] = await db
          .select()
          .from(table)
          .where(eq(col(table, rc.dedupeBy), values[rc.dedupeBy]))
          .limit(1)
        if (existing) continue // already seeded
      }

      await db.insert(table).values({ ...values, organizationId, ...materializedValues(def, { ...values, organizationId }) })
      contentRows++
    }
  }

  return { taxonomyNodes, contentRows, nodeIds }
}
