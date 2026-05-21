import 'server-only'

import { ResponseCookies } from 'next/dist/compiled/@edge-runtime/cookies'
import { nextServerConfig } from '../config'

export const appSessionCookieName = 'hmpps-people-on-probation-ui.session'
export const oneLoginTransactionCookieName = 'hmpps-people-on-probation-ui.one-login-transaction'

const secure = nextServerConfig.ingressUrl.startsWith('https://') || process.env.NODE_ENV === 'production'

export function setOneLoginTransactionCookie(cookies: ResponseCookies, transactionId: string, maxAgeSeconds: number) {
  cookies.set(oneLoginTransactionCookieName, transactionId, {
    httpOnly: true,
    maxAge: maxAgeSeconds,
    path: '/',
    sameSite: 'lax',
    secure,
  })
}

export function clearOneLoginTransactionCookie(cookies: ResponseCookies) {
  cookies.delete(oneLoginTransactionCookieName)
}

export function setAppSessionCookie(cookies: ResponseCookies, sessionId: string, maxAgeSeconds: number) {
  cookies.set(appSessionCookieName, sessionId, {
    httpOnly: true,
    maxAge: maxAgeSeconds,
    path: '/',
    sameSite: 'lax',
    secure,
  })
}

export function clearAppSessionCookie(cookies: ResponseCookies) {
  cookies.delete(appSessionCookieName)
}
