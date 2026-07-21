import { Request, Response } from 'express'
import config from '../config'

export const appSessionCookieName = 'hmpps-people-on-probation-ui.app-session'
export const oneLoginTransactionCookieName = 'hmpps-people-on-probation-ui.one-login-transaction'
// Separate from appSessionCookieName so an admin "preview as user" session
// (server/routes/admin.ts) can never collide with or overwrite a real
// citizen session sharing the same browser - the two can coexist as
// distinct cookies rather than fighting over one.
export const adminPreviewSessionCookieName = 'hmpps-people-on-probation-ui.admin-preview-session'

const secure = config.https

function setSessionCookie(res: Response, name: string, value: string, maxAgeSeconds: number) {
  res.cookie(name, value, {
    httpOnly: true,
    maxAge: maxAgeSeconds * 1000,
    path: '/',
    sameSite: 'lax',
    secure,
  })
}

function getSessionCookie(req: Request, name: string): string | undefined {
  return req.cookies?.[name]
}

function clearSessionCookie(res: Response, name: string) {
  res.clearCookie(name, { path: '/' })
}

export function setOneLoginTransactionCookie(res: Response, transactionId: string, maxAgeSeconds: number) {
  setSessionCookie(res, oneLoginTransactionCookieName, transactionId, maxAgeSeconds)
}

export function clearOneLoginTransactionCookie(res: Response) {
  clearSessionCookie(res, oneLoginTransactionCookieName)
}

export function getOneLoginTransactionCookie(req: Request): string | undefined {
  return getSessionCookie(req, oneLoginTransactionCookieName)
}

export function setAppSessionCookie(res: Response, sessionId: string, maxAgeSeconds: number) {
  setSessionCookie(res, appSessionCookieName, sessionId, maxAgeSeconds)
}

export function clearAppSessionCookie(res: Response) {
  clearSessionCookie(res, appSessionCookieName)
}

export function getAppSessionCookie(req: Request): string | undefined {
  return getSessionCookie(req, appSessionCookieName)
}

export function setAdminPreviewSessionCookie(res: Response, sessionId: string, maxAgeSeconds: number) {
  setSessionCookie(res, adminPreviewSessionCookieName, sessionId, maxAgeSeconds)
}

export function clearAdminPreviewSessionCookie(res: Response) {
  clearSessionCookie(res, adminPreviewSessionCookieName)
}

export function getAdminPreviewSessionCookie(req: Request): string | undefined {
  return getSessionCookie(req, adminPreviewSessionCookieName)
}
