import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { defineContentType } from './types'
import {
  ContentDetailScreen,
  ContentForm,
  ContentListScreen,
  contentColumns,
  contentFormFields,
  statusTone,
} from './screens'

const article = defineContentType({
  name: 'article',
  label: 'Article',
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'body', type: 'textarea' },
    { name: 'primary_tag', type: 'reference', to: 'tag' },
    { name: 'tags', type: 'link', to: 'tag' },
  ],
  computed: [
    { name: 'word_count', type: 'number', materialized: true, compute: () => 0 },
  ],
})

describe('contentColumns', () => {
  it('derives a column per non-link field, reads <name>_id for references, and adds status', () => {
    const keys = contentColumns(article).map((c) => c.key)
    expect(keys).toEqual(['title', 'body', 'primary_tag_id', 'word_count', 'status'])
    // link field never gets a column
    expect(keys).not.toContain('tags')
  })

  it('links the primary (first text) field to detail when basePath is given', () => {
    const html = renderToStaticMarkup(
      <ContentListScreen def={article} rows={[{ id: 'a1', title: 'Hello', status: 'draft' }]} basePath="/articles" />,
    )
    expect(html).toContain('href="/articles/a1"')
    expect(html).toContain('Hello')
  })
})

describe('statusTone', () => {
  it('maps the lifecycle states (unknown → muted)', () => {
    expect(statusTone('published')).toBe('default')
    expect(statusTone('archived')).toBe('danger')
    expect(statusTone('draft')).toBe('muted')
    expect(statusTone('???')).toBe('muted')
  })
})

describe('ContentListScreen', () => {
  it('renders the label, every row, and the status badge', () => {
    const html = renderToStaticMarkup(
      <ContentListScreen
        def={article}
        rows={[
          { id: 'a1', title: 'First', status: 'published' },
          { id: 'a2', title: 'Second', status: 'draft' },
        ]}
      />,
    )
    expect(html).toContain('Article')
    expect(html).toContain('First')
    expect(html).toContain('Second')
    expect(html).toContain('published')
  })

  it('shows a derived empty message when there are no rows', () => {
    const html = renderToStaticMarkup(<ContentListScreen def={article} rows={[]} />)
    expect(html).toContain('No article yet.')
  })
})

describe('ContentDetailScreen', () => {
  it('headers with the primary value, shows the status badge, and lists field values', () => {
    const html = renderToStaticMarkup(
      <ContentDetailScreen def={article} row={{ id: 'a1', title: 'The Title', body: 'Words', status: 'published' }} />,
    )
    expect(html).toContain('The Title')
    expect(html).toContain('Words')
    expect(html).toContain('published')
    // status is shown as a badge, not duplicated as a field row
    expect(html).not.toContain('>Status<')
  })
})

describe('contentFormFields / ContentForm', () => {
  it('derives editable fields, excluding computed/link, mapping reference to <name>_id', () => {
    const fields = contentFormFields(article)
    expect(fields.map((f) => f.name)).toEqual(['title', 'body', 'primary_tag_id'])
    expect(fields.find((f) => f.name === 'title')).toMatchObject({ kind: 'text', required: true })
    expect(fields.find((f) => f.name === 'body')).toMatchObject({ kind: 'textarea' })
    expect(fields.find((f) => f.name === 'primary_tag_id')).toMatchObject({ kind: 'reference' })
  })

  it('renders a create form posting to the action with an input per field', () => {
    const html = renderToStaticMarkup(<ContentForm def={article} action="/articles" />)
    expect(html).toContain('action="/articles"')
    expect(html).toContain('name="title"')
    expect(html).toContain('<textarea')
    expect(html).toContain('Create Article')
    expect(html).not.toContain('name="id"') // no hidden id on create
  })

  it('prefills and includes a hidden id when editing', () => {
    const html = renderToStaticMarkup(
      <ContentForm def={article} action="/articles/update" row={{ id: 'a1', title: 'Edit me' }} />,
    )
    expect(html).toContain('name="id"')
    expect(html).toContain('value="a1"')
    expect(html).toContain('Edit me')
    expect(html).toContain('Save')
  })
})
