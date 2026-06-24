import { describe, expect, it } from 'vitest'
import { defineContentType } from './types'
import { compileContentType, taxonomySchemaDdl } from './compile'

const note = defineContentType({
  name: 'note',
  label: 'Note',
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'body', type: 'textarea' },
    { name: 'rank', type: 'number' },
    { name: 'pinned', type: 'boolean' },
    { name: 'due', type: 'date' },
  ],
})

describe('compileContentType', () => {
  const { schema, tableName, sql } = compileContentType(note)

  it('targets the content schema by default', () => {
    expect(schema).toBe('content')
    expect(tableName).toBe('note')
    expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS content;')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS content.note (')
  })

  it('emits the engine-owned columns with an org FK', () => {
    expect(sql).toContain('id uuid PRIMARY KEY DEFAULT gen_random_uuid()')
    expect(sql).toContain(
      'organization_id uuid NOT NULL REFERENCES govcore.organizations (id) ON DELETE CASCADE',
    )
    expect(sql).toContain("status text NOT NULL DEFAULT 'draft'")
    expect(sql).toContain("CHECK (status IN ('draft', 'published', 'archived'))")
    expect(sql).toContain('created_at timestamptz NOT NULL DEFAULT now()')
  })

  it('maps field types to Postgres types and honors required', () => {
    expect(sql).toContain('title text NOT NULL')
    expect(sql).toContain('body text') // textarea → text, nullable
    expect(sql).not.toContain('body text NOT NULL')
    expect(sql).toContain('rank numeric')
    expect(sql).toContain('pinned boolean')
    expect(sql).toContain('due date')
  })

  it('generates the org index and the FORCEd RLS policy with the active-org GUC', () => {
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS note_organization_id_idx ON content.note (organization_id)')
    expect(sql).toContain('ALTER TABLE content.note ENABLE ROW LEVEL SECURITY;')
    expect(sql).toContain('ALTER TABLE content.note FORCE ROW LEVEL SECURITY;')
    expect(sql).toContain('CREATE POLICY note_org_isolation ON content.note')
    expect(sql).toContain("organization_id = nullif(current_setting('app.current_org', true), '')::uuid")
    expect(sql).toContain('WITH CHECK')
  })

  it('honors a custom schema', () => {
    const { sql: s2 } = compileContentType(note, { schema: 'app_content' })
    expect(s2).toContain('CREATE TABLE IF NOT EXISTS app_content.note (')
  })
})

describe('compileContentType — relationships (Rule 2)', () => {
  const capability = defineContentType({
    name: 'capability',
    fields: [
      { name: 'name', type: 'text', required: true },
      { name: 'owner', type: 'reference', to: 'person' }, // optional → SET NULL
      { name: 'domain', type: 'reference', to: 'domain', required: true }, // → RESTRICT
      { name: 'applications', type: 'link', to: 'application' },
    ],
  })
  const compiled = compileContentType(capability)

  it('emits a reference as a <name>_id FK column with the right ON DELETE', () => {
    expect(compiled.sql).toContain('owner_id uuid REFERENCES content.person (id) ON DELETE SET NULL')
    expect(compiled.sql).toContain(
      'domain_id uuid NOT NULL REFERENCES content.domain (id) ON DELETE RESTRICT',
    )
    expect(compiled.sql).toContain(
      'CREATE INDEX IF NOT EXISTS capability_owner_id_idx ON content.capability (owner_id)',
    )
  })

  it('generates a junction table for a link field (org-scoped + RLS)', () => {
    expect(compiled.junctions).toEqual([{ field: 'applications', tableName: 'capability__applications' }])
    expect(compiled.sql).toContain('CREATE TABLE IF NOT EXISTS content.capability__applications (')
    expect(compiled.sql).toContain('source_id uuid NOT NULL REFERENCES content.capability (id) ON DELETE CASCADE')
    expect(compiled.sql).toContain('target_id uuid NOT NULL REFERENCES content.application (id) ON DELETE CASCADE')
    expect(compiled.sql).toContain('PRIMARY KEY (source_id, target_id)')
    expect(compiled.sql).toContain('ALTER TABLE content.capability__applications FORCE ROW LEVEL SECURITY;')
    expect(compiled.sql).toContain('CREATE POLICY capability__applications_org_isolation')
  })

  it('compiles a taxonomy field to a <name>_node_id FK into taxonomy_nodes', () => {
    const tagged = defineContentType({
      name: 'doc',
      fields: [
        { name: 'area', type: 'taxonomy', tree: 'domains' }, // optional → SET NULL
        { name: 'phase', type: 'taxonomy', tree: 'adm', required: true }, // → RESTRICT
      ],
    })
    const { sql } = compileContentType(tagged)
    expect(sql).toContain('area_node_id uuid REFERENCES content.taxonomy_nodes (id) ON DELETE SET NULL')
    expect(sql).toContain(
      'phase_node_id uuid NOT NULL REFERENCES content.taxonomy_nodes (id) ON DELETE RESTRICT',
    )
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS doc_area_node_id_idx ON content.doc (area_node_id)')
  })
})

describe('taxonomySchemaDdl', () => {
  const sql = taxonomySchemaDdl()

  it('creates the engine-owned taxonomy_nodes table with a self-referencing parent FK', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS content.taxonomy_nodes (')
    expect(sql).toContain(
      'organization_id uuid NOT NULL REFERENCES govcore.organizations (id) ON DELETE CASCADE',
    )
    expect(sql).toContain('parent_id uuid REFERENCES content.taxonomy_nodes (id) ON DELETE CASCADE')
    expect(sql).toContain('tree text NOT NULL')
    expect(sql).toContain('slug text NOT NULL')
  })

  it('scopes slugs per org+tree and FORCEs RLS by the active-org GUC', () => {
    expect(sql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS taxonomy_nodes_slug_key ON content.taxonomy_nodes (organization_id, tree, slug)',
    )
    expect(sql).toContain('ALTER TABLE content.taxonomy_nodes FORCE ROW LEVEL SECURITY;')
    expect(sql).toContain('CREATE POLICY taxonomy_nodes_org_isolation ON content.taxonomy_nodes')
  })
})

describe('compileContentType — computed fields', () => {
  const doc = defineContentType({
    name: 'doc',
    fields: [{ name: 'title', type: 'text', required: true }],
    computed: [
      { name: 'completeness', type: 'number', materialized: true, compute: () => 0 },
      { name: 'has_body', type: 'boolean', compute: () => false }, // on-read → no column
    ],
  })
  const { sql } = compileContentType(doc)

  it('emits a real column only for materialized computed fields', () => {
    expect(sql).toContain('completeness numeric')
    expect(sql).not.toContain('has_body')
  })
})
