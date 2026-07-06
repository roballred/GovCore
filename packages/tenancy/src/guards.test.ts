import { describe, expect, it } from 'vitest'
import {
  LastActiveAdminError,
  leavesActiveAdminSet,
  wouldOrphanOrg,
  type MembershipChange,
} from './guards'

const change = (
  currentRole: string,
  currentIsActive: boolean,
  nextRole: string,
  nextIsActive: boolean,
): MembershipChange => ({ currentRole, currentIsActive, nextRole, nextIsActive })

describe('leavesActiveAdminSet', () => {
  it('true when demoting an active admin', () => {
    expect(leavesActiveAdminSet(change('admin', true, 'viewer', true), 'admin')).toBe(true)
  })

  it('true when deactivating an active admin (role unchanged)', () => {
    expect(leavesActiveAdminSet(change('admin', true, 'admin', false), 'admin')).toBe(true)
  })

  it('false on a no-op save of an active admin', () => {
    expect(leavesActiveAdminSet(change('admin', true, 'admin', true), 'admin')).toBe(false)
  })

  it('false on promotion into admin (never orphans)', () => {
    expect(leavesActiveAdminSet(change('viewer', true, 'admin', true), 'admin')).toBe(false)
  })

  it('false when the member was not an active admin to begin with', () => {
    // Already-inactive admin: removing them changes nothing about the active set.
    expect(leavesActiveAdminSet(change('admin', false, 'viewer', true), 'admin')).toBe(false)
  })

  it('false for changes among non-admins', () => {
    expect(leavesActiveAdminSet(change('viewer', true, 'contributor', true), 'admin')).toBe(false)
  })

  it('is generic over the admin role name', () => {
    // The bug this guards against: a consumer using a different role vocabulary.
    expect(leavesActiveAdminSet(change('owner', true, 'member', true), 'owner')).toBe(true)
    expect(leavesActiveAdminSet(change('admin', true, 'viewer', true), 'owner')).toBe(false)
  })
})

describe('wouldOrphanOrg', () => {
  const demote = change('admin', true, 'viewer', true)

  it('true when the departing admin was the only active admin', () => {
    expect(wouldOrphanOrg({ activeAdminCount: 1, change: demote, adminRole: 'admin' })).toBe(true)
  })

  it('false when another active admin remains', () => {
    expect(wouldOrphanOrg({ activeAdminCount: 2, change: demote, adminRole: 'admin' })).toBe(false)
  })

  it('false when the change does not remove the member from the admin set', () => {
    // Promotion with an empty org — must not report an orphan despite count 0.
    const promote = change('viewer', true, 'admin', true)
    expect(wouldOrphanOrg({ activeAdminCount: 0, change: promote, adminRole: 'admin' })).toBe(false)
  })
})

describe('LastActiveAdminError', () => {
  it('carries the organization id for typed routing', () => {
    const err = new LastActiveAdminError('org-123')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('LastActiveAdminError')
    expect(err.organizationId).toBe('org-123')
  })
})
