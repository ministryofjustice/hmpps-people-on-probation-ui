import { Request, Response, NextFunction } from 'express'
import { getAppSessionCookie, setAppSessionCookie, clearAppSessionCookie } from './cookies'
import { refreshAuthenticatedUserSession, getAuthenticatedUserSessionTtlSeconds } from './sessionStore'
import normaliseReturnTo from './returnTo'

export async function loadCurrentUser(req: Request, res: Response, next: NextFunction) {
  const sessionId = getAppSessionCookie(req)

  if (sessionId) {
    const session = await refreshAuthenticatedUserSession(sessionId)
    if (session) {
      setAppSessionCookie(res, session.id, getAuthenticatedUserSessionTtlSeconds())
      res.locals.user = session
      const sessionExpiresInSeconds = Math.floor((session.expiresAt - Date.now()) / 1000)
      res.locals.sessionTimeoutWarning = {
        warningAfterSeconds: Math.max(sessionExpiresInSeconds - 5 * 60, 0),
        countdownSeconds: Math.min(5 * 60, sessionExpiresInSeconds),
      }
    } else {
      clearAppSessionCookie(res)
      res.locals.sessionTimedOut = true
    }
  }

  next()
}

export function requireAuthentication(req: Request, res: Response, next: NextFunction) {
  if (res.locals.user) {
    return next()
  }

  if (res.locals.sessionTimedOut || getAppSessionCookie(req)) {
    return res.redirect('/session-timeout')
  }

  const returnTo = normaliseReturnTo(req.originalUrl)
  return res.redirect(`/?returnTo=${encodeURIComponent(returnTo)}`)
}
