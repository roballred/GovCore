import { createAuth } from '@govcore/auth'
import { db } from '@/db/client'

// Credentials-only for the demo (no OIDC provider configured). createAuth adds
// the local Credentials provider automatically.
export const { handlers, auth, signIn, signOut } = createAuth({
  db,
  defaultRole: 'viewer',
})
