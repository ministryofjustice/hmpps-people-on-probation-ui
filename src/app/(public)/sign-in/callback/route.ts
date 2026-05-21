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
import { authenticateOneLoginCallback, type OneLoginAuthenticatedUser } from '../../../../lib/server/auth/oneLoginToken'
import { getApplicationRedirectUrl } from '../../../../lib/server/auth/redirects'
import { getPeopleOnProbationService } from '../../../../lib/server/services/peopleOnProbationService'

async function getRegisteredUserDetails(
  transaction: { registrationInviteToken?: string },
  oneLoginUser: OneLoginAuthenticatedUser,
) {
  if (transaction.registrationInviteToken) {
    return getPeopleOnProbationService().completeOneLoginRegistration({
      token: transaction.registrationInviteToken,
      oneLoginSubject: oneLoginUser.userId,
      email: oneLoginUser.email,
      mobileNumber: oneLoginUser.phoneNumber,
    })
  }

  return getPeopleOnProbationService().getCurrentRegisteredUser({
    oneLoginSubject: oneLoginUser.userId,
  })
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function redirectToAuthError() {
  return NextResponse.redirect(getApplicationRedirectUrl('/autherror'))
}

export async function GET(request: NextRequest) {
  const transactionId = request.cookies.get(oneLoginTransactionCookieName)?.value
  if (!transactionId) return redirectToAuthError()

  const transaction = await getOneLoginTransaction(transactionId)
  if (!transaction) return redirectToAuthError()

  const error = request.nextUrl.searchParams.get('error')
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')

  if (error || !code || state !== transaction.state) {
    await deleteOneLoginTransaction(transactionId)
    const response = redirectToAuthError()
    clearOneLoginTransactionCookie(response.cookies)
    return response
  }

  const oneLoginUser = await authenticateOneLoginCallback(code, transaction)
  let registeredUserDetails
  try {
    registeredUserDetails = await getRegisteredUserDetails(transaction, oneLoginUser)
  } catch {
    await deleteOneLoginTransaction(transactionId)
    const response = redirectToAuthError()
    clearOneLoginTransactionCookie(response.cookies)
    return response
  }

  const session = createAuthenticatedUserSession({ ...oneLoginUser, registeredUserDetails })
  await saveAuthenticatedUserSession(session)
  await deleteOneLoginTransaction(transactionId)

  const response = NextResponse.redirect(getApplicationRedirectUrl(transaction.returnTo))
  clearOneLoginTransactionCookie(response.cookies)
  setAppSessionCookie(response.cookies, session.id, getAuthenticatedUserSessionTtlSeconds())

  return response
}
