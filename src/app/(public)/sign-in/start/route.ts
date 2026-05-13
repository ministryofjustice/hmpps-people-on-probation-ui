import { NextRequest, NextResponse } from 'next/server'
import {
  createOneLoginTransaction,
  getOneLoginTransactionTtlSeconds,
  saveOneLoginTransaction,
} from '../../../../lib/server/auth/loginTransactionStore'
import { setOneLoginTransactionCookie } from '../../../../lib/server/auth/cookies'
import { buildOneLoginAuthorizeUrl } from '../../../../lib/server/auth/oneLoginAuthorize'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const transaction = createOneLoginTransaction(request.nextUrl.searchParams.get('returnTo'))
  await saveOneLoginTransaction(transaction)

  const response = NextResponse.redirect(await buildOneLoginAuthorizeUrl(transaction))
  setOneLoginTransactionCookie(response.cookies, transaction.id, getOneLoginTransactionTtlSeconds())

  return response
}
