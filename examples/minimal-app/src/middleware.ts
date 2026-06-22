import { createMiddleware, defaultMatcher } from '@govcore/middleware'

export default createMiddleware({
  // Landing page is public; everything else needs a session; /instance needs instance_admin.
  publicPaths: ['/', '/login', '/error', '/api/auth', '/maintenance'],
  instanceOnlyPaths: ['/instance'],
})

export const config = { matcher: defaultMatcher }
