// The Capability spike (Appendix B §892): GovEA's richest entity expressed as
// @govcore/content configuration. This is the proving milestone — if the engine
// models a Capability cleanly (relationships, a completeness computed field, a
// publish-readiness gate, taxonomy filing) and the generated table is
// indistinguishable from the hand-written `capabilities` table, it can model the
// rest. Faithful to govea-app's apps/govea/src/db/schema/capabilities.ts:
// name/description/behaviors/rules/capability_type, an owner (the
// domain_owner_user_id seam), persona/application/parent-child junctions, and a
// taxonomy domain. (capability_type is a Postgres enum in GovEA; the engine has
// no enum scalar yet, so it's modeled as text here.)

import { defineContentType } from '@govcore/content'

type Row = Record<string, unknown>

/** Target types the capability relates to (reference / link). */
export const person = defineContentType({
  name: 'person',
  label: 'Person',
  fields: [{ name: 'full_name', type: 'text', required: true }],
})

export const application = defineContentType({
  name: 'application',
  label: 'Application',
  fields: [{ name: 'name', type: 'text', required: true }],
})

/** Descriptive fields that count toward a capability's readiness score. */
export const COMPLETENESS_FIELDS = ['description', 'behaviors', 'rules', 'owner_id', 'domain_node_id'] as const

/** Per-row completeness as a 0–100 percentage of the key fields that are filled. */
export function capabilityCompleteness(row: Row): number {
  const filled = COMPLETENESS_FIELDS.filter((f) => {
    const v = row[f]
    return v !== null && v !== undefined && String(v).trim() !== ''
  }).length
  return Math.round((filled / COMPLETENESS_FIELDS.length) * 100)
}

export const capability = defineContentType({
  name: 'capability',
  label: 'Capability',
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'description', type: 'textarea' },
    { name: 'behaviors', type: 'textarea' }, // what it must do — one per line (GovEA)
    { name: 'rules', type: 'textarea' }, // constraints & invariants (GovEA)
    { name: 'capability_type', type: 'text' }, // business | technical (a GovEA enum)
    { name: 'owner', type: 'reference', to: 'person' }, // domain_owner_user_id seam → SET NULL
    { name: 'applications', type: 'link', to: 'application' }, // traceability chain (to-many)
    { name: 'children', type: 'link', to: 'capability' }, // parent-child hierarchy (self link)
    { name: 'domain', type: 'taxonomy', tree: 'architecture-domains' }, // classification
  ],
  computed: [
    // materialized so a query can sort/filter on readiness without recomputing
    { name: 'completeness', type: 'number', materialized: true, compute: capabilityCompleteness },
  ],
  hooks: {
    // The publish-readiness gate — GovEA's hardest 20%, as real server code.
    // A capability can't be published until it has an owner, a domain, and a
    // description.
    beforePublish: (ctx) => {
      const r = ctx.row
      const missing: string[] = []
      if (!r.owner_id) missing.push('owner')
      if (!r.domain_node_id) missing.push('domain')
      if (!String(r.description ?? '').trim()) missing.push('description')
      if (missing.length) throw new Error(`publish blocked: capability needs ${missing.join(', ')}`)
    },
  },
})
