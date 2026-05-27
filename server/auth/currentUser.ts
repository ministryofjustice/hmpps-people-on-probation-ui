import { Request, Response, NextFunction } from 'express'
import { getAppSessionCookie } from './cookies'
import { getAuthenticatedUserSession } from './sessionStore'

export async function loadCurrentUser(req: Request, res: Response, next: NextFunction) {
  const sessionId = getAppSessionCookie(req)

  if (sessionId) {
    const session = await getAuthenticatedUserSession(sessionId)
    if (session) {
      res.locals.user = session
    }
  }

  next()
}

function normaliseReturnTo(returnTo: string) {
  if (!returnTo.startsWith('/') || returnTo.startsWith('//')) return '/'
  return returnTo
}

export function requireAuthentication(req: Request, res: Response, next: NextFunction) {
  if (res.locals.user) {
    return next()
  }

  const returnTo = normaliseReturnTo(req.originalUrl)
  return res.redirect(`/?returnTo=${encodeURIComponent(returnTo)}`)
}
