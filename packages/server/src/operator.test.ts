import { describe, expect, it, vi } from 'vitest'
import { createOperatorActions, INSTANCE_ADMIN_ROLE } from './operator'
import type { ActiveContext } from './index'

// The handler never touches the db in these tests, so a bare stub is enough to
// stand in for the privileged operatorDb — the audit writer is asserted via the
// recorded inserts on this fake.
function fakeOperatorDb() {
  const inserted: unknown[] = []
  const db = { insert: () => ({ values: async (v: unknown) => void inserted.push(v) }) }
  return { db: db as never, inserted }
}

const ctxFor = (over: Partial<ActiveContext>): ActiveContext => ({
  userId: 'u1',
  organizationId: 'o1',
  role: 'admin',
  instanceRole: null,
  ...over,
})

describe('createOperatorActions', () => {
  it('throws Unauthorized when there is no active context', async () => {
    const { db } = fakeOperatorDb()
    const operatorAction = createOperatorActions({ operatorDb: db, getActiveContext: async () => null })
    await expect(operatorAction(async () => 'ok')()).rejects.toThrow('Unauthorized')
  })

  it('throws Forbidden when the actor is not an instance admin', async () => {
    const { db } = fakeOperatorDb()
    const operatorAction = createOperatorActions({
      operatorDb: db,
      getActiveContext: async () => ctxFor({ instanceRole: null }),
    })
    await expect(operatorAction(async () => 'ok')()).rejects.toThrow('Forbidden')
  })

  it('runs the handler for an instance admin and passes the operator db', async () => {
    const { db } = fakeOperatorDb()
    const handler = vi.fn(async ({ db: handed }: { db: unknown }) => (handed === db ? 'ran' : 'wrong-db'))
    const operatorAction = createOperatorActions({
      operatorDb: db,
      getActiveContext: async () => ctxFor({ instanceRole: INSTANCE_ADMIN_ROLE }),
    })
    expect(await operatorAction(handler)()).toBe('ran')
  })

  it('honors a custom operatorRole', async () => {
    const { db } = fakeOperatorDb()
    const operatorAction = createOperatorActions({
      operatorDb: db,
      operatorRole: 'platform_owner',
      getActiveContext: async () => ctxFor({ instanceRole: 'platform_owner' }),
    })
    expect(await operatorAction(async () => 'ok')()).toBe('ok')
  })

  it('routes onUnauthorized / onForbidden overrides instead of throwing', async () => {
    const { db } = fakeOperatorDb()
    const noCtx = createOperatorActions({
      operatorDb: db,
      getActiveContext: async () => null,
      onUnauthorized: () => 'redirect-login' as never,
    })
    expect(await noCtx(async () => 'ok')()).toBe('redirect-login')

    const notAdmin = createOperatorActions({
      operatorDb: db,
      getActiveContext: async () => ctxFor({ instanceRole: null }),
      onForbidden: () => 'redirect-dashboard' as never,
    })
    expect(await notAdmin(async () => 'ok')()).toBe('redirect-dashboard')
  })

  it('binds audit to the operator as actor', async () => {
    const { db, inserted } = fakeOperatorDb()
    const operatorAction = createOperatorActions({
      operatorDb: db,
      getActiveContext: async () => ctxFor({ userId: 'op-7', instanceRole: INSTANCE_ADMIN_ROLE }),
    })
    await operatorAction(async ({ ctx }) => {
      await ctx.audit({ action: 'platform.org.suspend', entityType: 'organization' })
    })()
    expect(inserted).toHaveLength(1)
    expect((inserted[0] as { userId: string }).userId).toBe('op-7')
  })
})
