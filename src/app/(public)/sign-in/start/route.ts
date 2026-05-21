import { NextRequest, NextResponse } from 'next/server'
import {
  createOneLoginTransaction,
  getOneLoginTransactionTtlSeconds,
  saveOneLoginTransaction,
} from '../../../../lib/server/auth/loginTransactionStore'
import { setOneLoginTransactionCookie } from '../../../../lib/server/auth/cookies'
import { buildOneLoginAuthorizeUrl } from '../../../../lib/server/auth/oneLoginAuthorize'
import { getPeopleOnProbationService } from '../../../../lib/server/services/peopleOnProbationService'
import { getApplicationRedirectUrl } from '../../../../lib/server/auth/redirects'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function normaliseToken(token?: string | null) {
  return typeof token === 'string' && token.trim() ? token.trim() : null
}

async function validateRegistrationInviteIfPresent(token?: string | null) {
  const registrationInviteToken = normaliseToken(token)
  if (!registrationInviteToken) return null

  await getPeopleOnProbationService().validateRegistrationInvite(registrationInviteToken)
  return registrationInviteToken
}

export async function GET(request: NextRequest) {
  let registrationInviteToken: string | null = null
  try {
    registrationInviteToken = await validateRegistrationInviteIfPresent(request.nextUrl.searchParams.get('token'))
  } catch {
    return NextResponse.redirect(getApplicationRedirectUrl('/autherror'))
  }

  const transaction = createOneLoginTransaction(
    request.nextUrl.searchParams.get('returnTo'),
    registrationInviteToken ?? undefined,
  )
  await saveOneLoginTransaction(transaction)

  const response = NextResponse.redirect(await buildOneLoginAuthorizeUrl(transaction))
  setOneLoginTransactionCookie(response.cookies, transaction.id, getOneLoginTransactionTtlSeconds())

  return response
}
