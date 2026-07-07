import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  DataTable,
  TablePagination,
  pageHref,
  parsePageParams,
  DEFAULT_PAGE_SIZE,
} from './index'

describe('parsePageParams', () => {
  it('defaults to page 1 and the default page size', () => {
    expect(parsePageParams()).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE, offset: 0 })
    expect(parsePageParams({})).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE, offset: 0 })
  })

  it('reads page/pageSize and computes offset', () => {
    expect(parsePageParams({ page: '3', pageSize: '10' })).toEqual({ page: 3, pageSize: 10, offset: 20 })
  })

  it('accepts URLSearchParams', () => {
    expect(parsePageParams(new URLSearchParams('page=2&pageSize=5'))).toEqual({ page: 2, pageSize: 5, offset: 5 })
  })

  it('clamps garbage and out-of-range values to safe defaults', () => {
    expect(parsePageParams({ page: '-4' }).page).toBe(1) // never < 1
    expect(parsePageParams({ page: 'abc' }).page).toBe(1)
    expect(parsePageParams({ page: '0' }).offset).toBe(0) // no negative offset
    expect(parsePageParams({ pageSize: '9999' }).pageSize).toBe(100) // capped
    expect(parsePageParams({ pageSize: '0' }).pageSize).toBe(DEFAULT_PAGE_SIZE)
  })

  it('honors custom default and max page size', () => {
    expect(parsePageParams({}, { defaultPageSize: 50 }).pageSize).toBe(50)
    expect(parsePageParams({ pageSize: '75' }, { maxPageSize: 40 }).pageSize).toBe(40)
  })

  it('takes the first value of a repeated param', () => {
    expect(parsePageParams({ page: ['2', '9'] }).page).toBe(2)
  })
})

describe('pageHref', () => {
  it('sets page while preserving other params', () => {
    const href = pageHref('/notes', { pageSize: '10', q: 'draft' }, 3)
    expect(href.startsWith('/notes?')).toBe(true)
    const qs = new URLSearchParams(href.split('?')[1])
    expect(qs.get('page')).toBe('3')
    expect(qs.get('pageSize')).toBe('10')
    expect(qs.get('q')).toBe('draft')
  })

  it('works from URLSearchParams and with no params', () => {
    expect(pageHref('/x', new URLSearchParams('a=1'), 2)).toBe('/x?a=1&page=2')
    expect(pageHref('/x', undefined, 2)).toBe('/x?page=2')
  })
})

describe('TablePagination', () => {
  const props = { page: 2, pageSize: 10, total: 25, hrefForPage: (p: number) => `/x?page=${p}` }

  it('shows the current slice and total', () => {
    const html = renderToStaticMarkup(<TablePagination {...props} />)
    expect(html).toContain('Showing 11–20 of 25')
    expect(html).toContain('Page 2 of 3')
  })

  it('links prev/next to the adjacent pages when in range', () => {
    const html = renderToStaticMarkup(<TablePagination {...props} />)
    expect(html).toContain('href="/x?page=1"')
    expect(html).toContain('href="/x?page=3"')
  })

  it('disables prev on the first page and next on the last (renders no link)', () => {
    const first = renderToStaticMarkup(<TablePagination {...props} page={1} />)
    expect(first).not.toContain('href="/x?page=0"')
    const last = renderToStaticMarkup(<TablePagination {...props} page={3} />)
    expect(last).not.toContain('href="/x?page=4"')
  })

  it('reports an empty result set', () => {
    const html = renderToStaticMarkup(<TablePagination {...props} page={1} total={0} />)
    expect(html).toContain('No results')
    expect(html).toContain('Page 1 of 1')
  })
})

describe('DataTable pagination footer', () => {
  const columns = [{ key: 'name', header: 'Name' }]
  it('renders the footer only when pagination is provided', () => {
    const without = renderToStaticMarkup(<DataTable columns={columns} rows={[{ name: 'a' }]} />)
    expect(without).not.toContain('Showing')
    const withIt = renderToStaticMarkup(
      <DataTable
        columns={columns}
        rows={[{ name: 'a' }]}
        pagination={{ page: 1, pageSize: 10, total: 1, hrefForPage: (p) => `?page=${p}` }}
      />,
    )
    expect(withIt).toContain('Showing 1–1 of 1')
  })
})
