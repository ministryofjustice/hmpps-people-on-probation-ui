import { Request, Response, NextFunction } from 'express'
import {
  getAppSessionCookie,
  setAppSessionCookie,
  clearAppSessionCookie,
  getAdminPreviewSessionCookie,
  setAdminPreviewSessionCookie,
  clearAdminPreviewSessionCookie,
} from './cookies'
import { refreshAuthenticatedUserSession, getAuthenticatedUserSessionTtlSeconds } from './sessionStore'
import normaliseReturnTo from './returnTo'
import logger from '../../logger'

export async function loadCurrentUser(req: Request, res: Response, next: NextFunction) {
  // An active admin preview (server/routes/admin.ts) takes precedence over
  // a citizen session that happens to share the same browser - the two are
  // on separate cookies and can coexist without one clobbering the other.
  const previewSessionId = getAdminPreviewSessionCookie(req)
  const isPreviewSession = Boolean(previewSessionId)
  const sessionId = previewSessionId ?? getAppSessionCookie(req)
  const setSessionCookie = isPreviewSession ? setAdminPreviewSessionCookie : setAppSessionCookie
  const clearSessionCookie = isPreviewSession ? clearAdminPreviewSessionCookie : clearAppSessionCookie

  if (sessionId) {
    const session = await refreshAuthenticatedUserSession(sessionId)
    if (session) {
      setSessionCookie(res, session.id, getAuthenticatedUserSessionTtlSeconds())
      res.locals.user = session

      // The countdown/keep-alive popup only exists for the citizen session
      // (/session/keep-alive and /session-timeout only handle the citizen
      // cookie) - not showing it for an admin preview.
      if (!isPreviewSession) {
        const sessionExpiresInSeconds = Math.floor((session.expiresAt - Date.now()) / 1000)
        res.locals.sessionTimeoutWarning = {
          warningAfterSeconds: Math.max(sessionExpiresInSeconds - 5 * 60, 0),
          countdownSeconds: Math.min(5 * 60, sessionExpiresInSeconds),
        }
      }
    } else {
      clearSessionCookie(res)
      res.locals.sessionTimedOut = true
      logger.info({ correlationId: req.id }, 'App session expired or not found; user will be redirected to sign in')
    }
  }

  next()
}

export function requireAuthentication(req: Request, res: Response, next: NextFunction) {
  if (res.locals.user) {
    return next()
  }

  if (res.locals.sessionTimedOut || getAppSessionCookie(req) || getAdminPreviewSessionCookie(req)) {
    return res.redirect('/session-timeout')
  }

  const returnTo = normaliseReturnTo(req.originalUrl)
  return res.redirect(`/?returnTo=${encodeURIComponent(returnTo)}`)
}
