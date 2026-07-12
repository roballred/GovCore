// The consuming app owns its session/JWT shape (#108): @govcore/auth no longer
// ships a global `next-auth` augmentation, so this app types `role` as ITS OWN
// role union (matching src/lib/rbac.ts) instead of the bare `string` core used to
// force. A single-role app that doesn't care could instead opt into a ready-made
// default with `import '@govcore/auth/next-auth'`.
//
// No top-level import — this file must stay a *script* (not a module) so its
// `declare module` augmentations apply ambiently across the app without being
// imported. `DefaultSession` is referenced via an inline `import(...)` type.

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: 'admin' | 'member' | 'viewer'
      organizationId: string | null
      instanceRole: string | null
    } & import('next-auth').DefaultSession['user']
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
