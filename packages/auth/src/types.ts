// OPT-IN module augmentation for the session/JWT shape createAuth stamps.
//
// This is NOT imported by ./index — shipping a global `declare module 'next-auth'`
// from the package entry would override a consumer's own session typing (e.g. a
// consumer that types `role` as its own union, not bare `string`; see #108).
// A single-role consumer that wants this ready-made shape opts in explicitly:
//
//   import '@govcore/auth/next-auth'
//
// A consumer with its own role type instead declares its own `next-auth`
// augmentation and skips this.

import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: string
      organizationId: string | null
      instanceRole: string | null
      // Security-policy snapshot (#107).
      sessionTimeoutMinutes?: number
      passwordExpiryDays?: number
      lastPasswordChangedAt?: number | null
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
    // Security-policy snapshot (#107).
    issuedAt?: number
    sessionTimeoutMinutes?: number
    passwordExpiryDays?: number
    lastPasswordChangedAt?: number | null
  }
}
