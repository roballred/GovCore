---
"@govcore/content": minor
---

Taxonomy binding — the third engine seed (Appendix B). A content type's `taxonomy` field is now first-class: it compiles to a `<name>_node_id` FK into one engine-owned, org-scoped, RLS-bound `content.taxonomy_nodes` table (shipped by `taxonomySchemaDdl`), and `buildTree` turns a flat node list into a sorted hierarchy for filter/picker UIs. Adds `buildTaxonomyTable`, `TaxonomyNode`/`TaxonomyTreeNode`, and `taxonomyNodeColumn`; wires taxonomy through validation (requires `tree`) and the generated screens. Also tightens `defineContentType` to reject two fields whose derived columns collide (e.g. a reference `organization` → reserved `organization_id`).
