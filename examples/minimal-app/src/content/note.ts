// A domain content type, defined as data and compiled by @govcore/content into a
// real RLS-bound table — the consumer's view of the engine. A real app declares
// its own types here (Notes, Permits, …); GovCore turns each into storage,
// validation, generated actions, and generated screens.

import { buildContentTable, defineContentType } from '@govcore/content'

export const note = defineContentType({
  name: 'note',
  label: 'Note',
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'body', type: 'textarea' },
  ],
  computed: [
    // materialized so the list can show it without recomputing on read
    { name: 'length', type: 'number', materialized: true, compute: (row) => String(row.body ?? '').length },
  ],
})

/** The runtime Drizzle table for `note` (mirrors the compiled DDL exactly). */
export const noteTable = buildContentTable(note)
