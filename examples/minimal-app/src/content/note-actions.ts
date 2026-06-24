// The app's generated CRUD for `note`, wired through @govcore/server's
// tenantAction — so every call resolves the actor's active org from the trusted
// session (never input), runs inside a transaction with the `app.current_org`
// RLS GUC, and is audited. This is exactly what a consumer writes: ~10 lines to
// turn a content-type definition into org-scoped, audited, permission-checked
// server actions.

import { generateContentActions } from '@govcore/content'
import { createTenantActions } from '@govcore/server'
import { db } from '@/db/client'
import { auth } from '@/lib/auth'
import { rbac } from '@/lib/rbac'
import { note, noteTable } from './note'

const tenantAction = createTenantActions({
  db,
  rbac, // the createRbac instance plugs straight in (see CreateTenantActionsConfig)
  // The active context comes from the auth() session (stamped by @govcore/auth's
  // JWT/session callbacks), never from request input.
  getActiveContext: async () => {
    const session = await auth()
    const user = session?.user
    if (!user?.id || !user.organizationId) return null
    return {
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role ?? 'viewer',
      instanceRole: user.instanceRole ?? null,
    }
  },
})

export const noteActions = generateContentActions(tenantAction, note, noteTable, {
  permissions: { create: 'content:write', update: 'content:write', remove: 'content:write', publish: 'content:write' },
})
