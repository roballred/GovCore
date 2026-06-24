// @govcore/content/taxonomy — the shared classification any type files under.
//
// Appendix B's third engine seed: `buildTree` "turns a flat list of nodes into a
// hierarchy." A taxonomy is a tree of classification nodes (e.g. the TOGAF ADM
// domains, per ADR-0002). Nodes live in one engine-owned `taxonomy_nodes` table
// (org-scoped, RLS, shipped by `taxonomySchemaDdl`); a content type's `taxonomy`
// field files a row under a node via a generated `<name>_node_id` FK. Recipes
// (a later slice) install trees of nodes per organization.

/** The engine-owned table (in the content schema) every tree's nodes live in. */
export const TAXONOMY_NODES_TABLE = 'taxonomy_nodes'

/** The FK column/JS key a `taxonomy` field "<name>" files through. */
export function taxonomyNodeColumn(fieldName: string): string {
  return `${fieldName}_node_id`
}

/** A classification node, as stored — one row of `taxonomy_nodes`. */
export interface TaxonomyNode {
  id: string
  /** The tree this node belongs to (e.g. `architecture-domains`). */
  tree: string
  /** Parent node id, or null for a root. */
  parentId: string | null
  label: string
  /** Stable key within the tree (unique per org+tree). */
  slug: string
  /** Sibling ordering; lower sorts first. */
  sort?: number | null
}

/** A node with its descendants attached — the shape `buildTree` returns. */
export type TaxonomyTreeNode<T extends TaxonomyNode = TaxonomyNode> = T & {
  children: TaxonomyTreeNode<T>[]
}

function bySortThenLabel(a: TaxonomyNode, b: TaxonomyNode): number {
  const sa = a.sort ?? 0
  const sb = b.sort ?? 0
  return sa !== sb ? sa - sb : a.label.localeCompare(b.label)
}

/**
 * Turn a flat list of nodes into a hierarchy: roots (no parent, or a parent not
 * present in the input) with their children attached, each level sorted by
 * `sort` then `label`. Pure — pass the rows you read from `taxonomy_nodes`
 * (typically already filtered to one `tree` and the active org by RLS).
 */
export function buildTree<T extends TaxonomyNode>(nodes: T[]): TaxonomyTreeNode<T>[] {
  const byId = new Map<string, TaxonomyTreeNode<T>>()
  for (const n of nodes) byId.set(n.id, { ...n, children: [] })

  const roots: TaxonomyTreeNode<T>[] = []
  for (const n of byId.values()) {
    const parent = n.parentId ? byId.get(n.parentId) : undefined
    if (parent) parent.children.push(n)
    else roots.push(n) // no parent, or parent outside this slice → a root here
  }

  const sortRec = (level: TaxonomyTreeNode<T>[]) => {
    level.sort(bySortThenLabel)
    for (const c of level) sortRec(c.children)
  }
  sortRec(roots)
  return roots
}
