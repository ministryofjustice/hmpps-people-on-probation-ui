import { Request, Response } from 'express'
import config from '../config'

export const appSessionCookieName = 'hmpps-people-on-probation-ui.app-session'
export const oneLoginTransactionCookieName = 'hmpps-people-on-probation-ui.one-login-transaction'

const secure = config.https

export function setOneLoginTransactionCookie(res: Response, transactionId: string, maxAgeSeconds: number) {
  res.cookie(oneLoginTransactionCookieName, transactionId, {
    httpOnly: true,
    maxAge: maxAgeSeconds * 1000,
    path: '/',
    sameSite: 'lax',
    secure,
  })
}

export function clearOneLoginTransactionCookie(res: Response) {
  res.clearCookie(oneLoginTransactionCookieName, { path: '/' })
}

export function setAppSessionCookie(res: Response, sessionId: string, maxAgeSeconds: number) {
  res.cookie(appSessionCookieName, sessionId, {
    httpOnly: true,
    maxAge: maxAgeSeconds * 1000,
    path: '/',
    sameSite: 'lax',
    secure,
  })
}

export function clearAppSessionCookie(res: Response) {
  res.clearCookie(appSessionCookieName, { path: '/' })
}

export function getOneLoginTransactionCookie(req: Request): string | undefined {
  return req.cookies?.[oneLoginTransactionCookieName]
}

export function getAppSessionCookie(req: Request): string | undefined {
  return req.cookies?.[appSessionCookieName]
}
