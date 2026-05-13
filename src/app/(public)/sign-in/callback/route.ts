import { NextRequest, NextResponse } from 'next/server'
import {
  clearOneLoginTransactionCookie,
  oneLoginTransactionCookieName,
  setAppSessionCookie,
} from '../../../../lib/server/auth/cookies'
import { deleteOneLoginTransaction, getOneLoginTransaction } from '../../../../lib/server/auth/loginTransactionStore'
import {
  createAuthenticatedUserSession,
  getAuthenticatedUserSessionTtlSeconds,
  saveAuthenticatedUserSession,
} from '../../../../lib/server/auth/sessionStore'
import { authenticateOneLoginCallback } from '../../../../lib/server/auth/oneLoginToken'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function redirectToAuthError(request: NextRequest) {
  return NextResponse.redirect(new URL('/autherror', request.url))
}

export async function GET(request: NextRequest) {
  const transactionId = request.cookies.get(oneLoginTransactionCookieName)?.value
  if (!transactionId) return redirectToAuthError(request)

  const transaction = await getOneLoginTransaction(transactionId)
  if (!transaction) return redirectToAuthError(request)

  const error = request.nextUrl.searchParams.get('error')
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')

  if (error || !code || state !== transaction.state) {
    await deleteOneLoginTransaction(transactionId)
    const response = redirectToAuthError(request)
    clearOneLoginTransactionCookie(response.cookies)
    return response
  }

  const oneLoginUser = await authenticateOneLoginCallback(code, transaction)
  const session = createAuthenticatedUserSession(oneLoginUser)
  await saveAuthenticatedUserSession(session)
  await deleteOneLoginTransaction(transactionId)

  const response = NextResponse.redirect(new URL(transaction.returnTo, request.url))
  clearOneLoginTransactionCookie(response.cookies)
  setAppSessionCookie(response.cookies, session.id, getAuthenticatedUserSessionTtlSeconds())

  return response
}
