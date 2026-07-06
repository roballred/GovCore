import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { defineContentType } from './types'
import {
  ContentDetailScreen,
  ContentForm,
  ContentListScreen,
  contentColumns,
  contentFormFields,
  parseContentForm,
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

describe('reference display (#61)', () => {
  const refs = {
    primary_tag: {
      options: [
        { value: 't1', label: 'News' },
        { value: 't2', label: 'Opinion' },
      ],
      hrefBase: '/tags',
    },
  }

  it('renders reference labels (linked via hrefBase) in lists instead of uuids', () => {
    const html = renderToStaticMarkup(
      <ContentListScreen
        def={article}
        rows={[{ id: 'a1', title: 'Hello', primary_tag_id: 't1', status: 'draft' }]}
        references={refs}
      />,
    )
    expect(html).toContain('News')
    expect(html).toContain('href="/tags/t1"')
    expect(html).not.toContain('>t1<')
  })

  it('renders — for a null reference and a truncated id for an unknown one', () => {
    const html = renderToStaticMarkup(
      <ContentListScreen
        def={article}
        rows={[
          { id: 'a1', title: 'A', primary_tag_id: null, status: 'draft' },
          { id: 'a2', title: 'B', primary_tag_id: 'zzzzzzzz-dead-beef', status: 'draft' },
        ]}
        references={refs}
      />,
    )
    expect(html).toContain('—')
    expect(html).toContain('zzzzzzzz…')
  })

  it('renders reference labels in the detail screen', () => {
    const html = renderToStaticMarkup(
      <ContentDetailScreen def={article} row={{ id: 'a1', title: 'Hello', primary_tag_id: 't2', status: 'published' }} references={refs} />,
    )
    expect(html).toContain('Opinion')
    expect(html).not.toContain('>t2<')
  })

  it('renders a select (with empty option for optional refs) in ContentForm, prefilled on edit', () => {
    const html = renderToStaticMarkup(
      <ContentForm def={article} action="/x" row={{ id: 'a1', title: 'Hello', primary_tag_id: 't2' }} references={refs} />,
    )
    expect(html).toContain('<select')
    expect(html).toContain('name="primary_tag_id"')
    expect(html).toContain('<option value="">—</option>')
    expect(html).toMatch(/<option[^>]*selected[^>]*value="t2"|<option[^>]*value="t2"[^>]*selected/)
  })

  it('falls back to the uuid input when no options are provided', () => {
    const html = renderToStaticMarkup(<ContentForm def={article} action="/x" />)
    expect(html).not.toContain('<select')
    expect(html).toContain('name="primary_tag_id"')
  })
})

describe('parseContentForm', () => {
  it('nulls empty optional inputs, booleans checkboxes, trims, and ignores foreign keys', () => {
    const withFlag = defineContentType({
      name: 'flagged',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'body', type: 'textarea' },
        { name: 'due', type: 'date' },
        { name: 'done', type: 'boolean' },
        { name: 'primary_tag', type: 'reference', to: 'tag' },
      ],
    })
    const fd = new FormData()
    fd.set('title', '  Hello  ')
    fd.set('body', '')
    fd.set('due', '')
    fd.set('primary_tag_id', '')
    fd.set('unrelated', 'x')
    // 'done' unchecked → absent from FormData

    expect(parseContentForm(withFlag, fd)).toEqual({
      title: 'Hello',
      body: null,
      due: null,
      done: false,
      primary_tag_id: null,
    })
  })
})

describe('ContentForm choices', () => {
  it('renders a select for an enumerated scalar field, prefilled on edit', () => {
    const html = renderToStaticMarkup(
      <ContentForm
        def={article}
        action="/x"
        row={{ id: 'a1', title: 'Hello', body: 'b' }}
        choices={{ title: [{ value: 'Hello', label: 'Hello' }, { value: 'Bye', label: 'Bye' }] }}
      />,
    )
    expect(html).toContain('<select')
    expect(html).toContain('name="title"')
    expect(html).toMatch(/<option[^>]*selected[^>]*value="Hello"|<option[^>]*value="Hello"[^>]*selected/)
  })
})
