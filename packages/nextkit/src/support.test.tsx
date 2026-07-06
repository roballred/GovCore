import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  ActAsBanner,
  BreakGlassGrantForm,
  SupportSessionsTable,
  TenantSupportVisibility,
  supportStatusTone,
  type SupportSessionView,
} from './support'

const session = (over: Partial<SupportSessionView> = {}): SupportSessionView => ({
  id: 's1',
  operator: 'ops@example.test',
  tenant: 'Riverbend',
  when: 'Jan 1, 2026',
  detail: 'investigating a sync bug',
  status: 'active',
  ...over,
})

describe('supportStatusTone', () => {
  it('flags active access as danger', () => {
    expect(supportStatusTone('active')).toBe('danger')
  })
  it('keeps pending neutral and terminal states muted', () => {
    expect(supportStatusTone('pending')).toBe('default')
    for (const s of ['expired', 'revoked', 'ended'] as const) {
      expect(supportStatusTone(s)).toBe('muted')
    }
  })
})

describe('SupportSessionsTable', () => {
  it('renders a row with operator, tenant, detail, and status', () => {
    const html = renderToStaticMarkup(<SupportSessionsTable sessions={[session()]} />)
    expect(html).toContain('ops@example.test')
    expect(html).toContain('Riverbend')
    expect(html).toContain('investigating a sync bug')
    expect(html).toContain('active')
  })

  it('shows the empty message when there are no sessions', () => {
    const html = renderToStaticMarkup(<SupportSessionsTable sessions={[]} empty="Nothing here." />)
    expect(html).toContain('Nothing here.')
  })

  it('omits the tenant column when showTenant is false', () => {
    const html = renderToStaticMarkup(
      <SupportSessionsTable sessions={[session()]} showTenant={false} />,
    )
    expect(html).not.toContain('>Tenant<')
  })
})

describe('TenantSupportVisibility', () => {
  it('reassures with a healthy empty state when no access has occurred', () => {
    const html = renderToStaticMarkup(<TenantSupportVisibility sessions={[]} orgName="Riverbend" />)
    expect(html).toContain('Support access to Riverbend')
    expect(html).toContain('healthy state')
  })

  it('warns when an operator currently holds active access', () => {
    const html = renderToStaticMarkup(<TenantSupportVisibility sessions={[session({ status: 'active' })]} />)
    expect(html).toContain('currently has active access')
  })

  it('does not warn when all sessions are terminal', () => {
    const html = renderToStaticMarkup(
      <TenantSupportVisibility sessions={[session({ status: 'expired' })]} />,
    )
    expect(html).not.toContain('currently has active access')
  })
})

describe('ActAsBanner', () => {
  it('names the tenant and renders an End button when an action is given', () => {
    const html = renderToStaticMarkup(<ActAsBanner tenant="Riverbend" endAction={async () => {}} />)
    expect(html).toContain('Riverbend')
    expect(html).toContain('End session')
    expect(html).toContain('audited')
  })

  it('omits the End button without an action (read-only indicator)', () => {
    const html = renderToStaticMarkup(<ActAsBanner tenant="Riverbend" />)
    expect(html).not.toContain('<button')
  })
})

describe('BreakGlassGrantForm', () => {
  it('renders an option per organization and the duration choices', () => {
    const html = renderToStaticMarkup(
      <BreakGlassGrantForm
        action={async () => {}}
        organizations={[
          { id: 'o1', name: 'Riverbend' },
          { id: 'o2', name: 'Harris County' },
        ]}
      />,
    )
    expect(html).toContain('Riverbend')
    expect(html).toContain('Harris County')
    expect(html).toContain('60 minutes')
  })
})
