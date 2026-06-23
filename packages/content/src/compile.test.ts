import { describe, expect, it } from 'vitest'
import { defineContentType } from './types'
import { compileContentType } from './compile'

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

  it('rejects relationship field types (deferred to Rule 2)', () => {
    const cap = defineContentType({
      name: 'capability',
      fields: [{ name: 'owner', type: 'reference', to: 'person' }],
    })
    expect(() => compileContentType(cap)).toThrow(/relationship — not supported yet/)
  })
})
