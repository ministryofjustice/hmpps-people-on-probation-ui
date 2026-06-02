import { Request, Response, NextFunction } from 'express'
import { getAppSessionCookie } from './cookies'
import { getAuthenticatedUserSession } from './sessionStore'
import normaliseReturnTo from './returnTo'
import config from '../config'

export async function loadCurrentUser(req: Request, res: Response, next: NextFunction) {
  const sessionId = getAppSessionCookie(req)

  if (sessionId) {
    const session = await getAuthenticatedUserSession(sessionId)
    if (session) {
      res.locals.user = session
      res.locals.sessionTimeoutWarning = {
        warningAfterSeconds: Math.max((config.session.expiryMinutes - 5) * 60, 0),
        countdownSeconds: Math.min(5 * 60, config.session.expiryMinutes * 60),
      }
    } else {
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
