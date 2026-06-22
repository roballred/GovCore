// @govcore/middleware — the edge-safe Next.js route-protection factory.
//
// Deliberately NOT next-auth's `auth()` wrapper: that re-issues (rolls) the
// session cookie on its responses, making the middleware itself a resurrection
// emitter that fights the #782 guard. `getToken` is a read-only decode — this
// middleware never writes session cookies (ADR-0003). Edge-safe: token decode +
// pure arithmetic, no DB. The only cross-package import is @govcore/auth's pure
// `logout-marker` subpath (no next-auth/db pulled in).

import { getToken, type JWT } from 'next-auth/jwt'
import { NextResponse, type NextRequest } from 'next/server'
import { LOGGED_OUT_MARKER_COOKIE, isResurrectedSession } from '@govcore/auth/logout-marker'

export interface CreateMiddlewareOptions {
  /** Path prefixes reachable without a session. */
  publicPaths?: string[]
  /** Path prefixes that require an instance-level role. */
  instanceOnlyPaths?: string[]
  /** The `instanceRole` value that satisfies instanceOnlyPaths. Default 'instance_admin'. */
  instanceRole?: string
  /** When true, only `maintenanceBypassRole` may pass; everyone else → maintenancePath. */
  maintenanceMode?: boolean
  /** Role allowed through during maintenance. Default 'admin'. */
  maintenanceBypassRole?: string
  loginPath?: string
  maintenancePath?: string
  /** Where instance-only violations are sent. Default '/'. */
  homePath?: string
  /** Auth.js secret. Defaults to process.env.AUTH_SECRET. */
  authSecret?: string
}

const DEFAULT_PUBLIC_PATHS = ['/login', '/setup', '/error', '/api/auth', '/maintenance']

/** Matcher that excludes static assets and the Auth.js endpoints (they manage their own cookies). */
export const defaultMatcher = ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)']

/**
 * Absolute redirect that never echoes the container bind address (#807). Next
 * middleware requires an absolute Location; behind a TLS-terminating proxy the
 * request origin can be `0.0.0.0:3000`, which we rebuild from the forwarded host
 * or NEXT_PUBLIC_APP_URL.
 */
function redirectTo(req: NextRequest, path: string): NextResponse {
  const target = new URL(path, req.nextUrl.origin)
  if (target.hostname === '0.0.0.0') {
    const fwdHost = req.headers.get('x-forwarded-host')?.split(',')[0].trim()
    const fwdProto = req.headers.get('x-forwarded-proto')?.split(',')[0].trim()
    const base =
      (fwdHost && !fwdHost.startsWith('0.0.0.0') && `${fwdProto || 'https'}://${fwdHost}`) ||
      process.env.NEXT_PUBLIC_APP_URL ||
      null
    if (base) {
      try {
        return NextResponse.redirect(new URL(path, base))
      } catch {
        /* malformed base — fall through */
      }
    }
  }
  return NextResponse.redirect(target)
}

/** Read-only session decode — checks both secure and plain cookie salts. */
async function decodeSession(req: NextRequest, secret: string | undefined): Promise<JWT | null> {
  return (
    (await getToken({ req, secret, secureCookie: true, salt: '__Secure-authjs.session-token' })) ??
    (await getToken({ req, secret, secureCookie: false, salt: 'authjs.session-token' }))
  )
}

/** Build a Next.js middleware function from GovCore's route-protection rules. */
export function createMiddleware(opts: CreateMiddlewareOptions = {}) {
  const publicPaths = opts.publicPaths ?? DEFAULT_PUBLIC_PATHS
  const instanceOnlyPaths = opts.instanceOnlyPaths ?? ['/instance']
  const instanceRole = opts.instanceRole ?? 'instance_admin'
  const maintenanceBypassRole = opts.maintenanceBypassRole ?? 'admin'
  const loginPath = opts.loginPath ?? '/login'
  const maintenancePath = opts.maintenancePath ?? '/maintenance'
  const homePath = opts.homePath ?? '/'

  return async function middleware(req: NextRequest): Promise<NextResponse> {
    const { pathname } = req.nextUrl

    const isPublic = publicPaths.some((p) => pathname.startsWith(p))
    const isStatic = pathname.startsWith('/_next') || pathname === '/favicon.ico'
    if (isPublic || isStatic) return NextResponse.next()

    const secret = opts.authSecret ?? process.env.AUTH_SECRET
    const token = await decodeSession(req, secret)

    // #782 — post-logout resurrection guard. Reject (and actively delete) any
    // session token issued before the logged-out marker (plus the guard window).
    const loggedOutMarker = req.cookies.get(LOGGED_OUT_MARKER_COOKIE)?.value
    if (token && isResurrectedSession(loggedOutMarker, token.iat as number | undefined)) {
      const res = redirectTo(req, loginPath)
      for (const cookie of req.cookies.getAll()) {
        if (cookie.name.includes('authjs.session-token')) {
          res.cookies.set(cookie.name, '', {
            maxAge: 0,
            expires: new Date(0),
            path: '/',
            secure: cookie.name.startsWith('__Secure-'),
          })
        }
      }
      return res
    }

    if (!token) return redirectTo(req, loginPath)

    const maintenanceMode = opts.maintenanceMode ?? process.env.MAINTENANCE_MODE === 'true'
    if (maintenanceMode && token.role !== maintenanceBypassRole) {
      return redirectTo(req, maintenancePath)
    }

    if (
      instanceOnlyPaths.some((p) => pathname.startsWith(p)) &&
      token.instanceRole !== instanceRole
    ) {
      return redirectTo(req, homePath)
    }

    return NextResponse.next()
  }
}
