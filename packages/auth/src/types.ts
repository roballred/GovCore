// Module augmentation: the session/JWT shape GovCore stamps. Importing this file
// (done by ./index) makes token.* and session.user.* typed for consumers too.

import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: string
      organizationId: string | null
      instanceRole: string | null
    } & DefaultSession['user']
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id?: string
    role?: string
    organizationId?: string | null
    instanceRole?: string | null
    checkedAt?: number
  }
}
