import { createMiddleware } from '@govcore/middleware'

export default createMiddleware({
  // Landing page is public; everything else needs a session; /instance needs instance_admin.
  publicPaths: ['/', '/login', '/error', '/api/auth', '/maintenance'],
  instanceOnlyPaths: ['/instance'],
})

// Next.js statically parses `config.matcher` at build time and rejects any value
// it can't resolve to a literal — an imported binding (e.g. `defaultMatcher`)
// fails with "Invalid segment configuration export". Keep this inline; mirror the
// value of @govcore/middleware's `defaultMatcher`.
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'] }
