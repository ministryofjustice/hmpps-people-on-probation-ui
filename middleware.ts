import { NextRequest, NextResponse } from 'next/server'
import { appSessionCookieName } from './src/lib/server/auth/cookies'

const publicPaths = [
  '/',
  '/autherror',
  '/health',
  '/info',
  '/ping',
  '/sign-in/start',
  '/sign-in/callback',
  '/sign-out',
  '/.well-known/jwks.json',
]

function isPublicPath(pathname: string) {
  return (
    publicPaths.includes(pathname) ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/generated/') ||
    pathname === '/favicon.ico'
  )
}

function buildReturnTo(request: NextRequest) {
  return `${request.nextUrl.pathname}${request.nextUrl.search}`
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  if (request.cookies.has(appSessionCookieName)) {
    return NextResponse.next()
  }

  const startUrl = new URL('/', request.url)
  startUrl.searchParams.set('returnTo', buildReturnTo(request))

  return NextResponse.redirect(startUrl)
}

export const config = {
  matcher: ['/((?!api/).*)'],
}
