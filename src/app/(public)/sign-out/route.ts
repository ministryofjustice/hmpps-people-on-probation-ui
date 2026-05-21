import { NextRequest, NextResponse } from 'next/server'
import { appSessionCookieName, clearAppSessionCookie } from '../../../lib/server/auth/cookies'
import { deleteAuthenticatedUserSession, getAuthenticatedUserSession } from '../../../lib/server/auth/sessionStore'
import { getOneLoginDiscoveryDocument } from '../../../lib/server/auth/oneLoginDiscovery'
import { nextServerConfig } from '../../../lib/server/config'
import { getApplicationRedirectUrl } from '../../../lib/server/auth/redirects'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getLocalSignedOutRedirect() {
  return getApplicationRedirectUrl('/')
}

async function getOneLoginLogoutUrl(idToken?: string) {
  if (!idToken) return getLocalSignedOutRedirect()

  const discoveryDocument = await getOneLoginDiscoveryDocument()
  const endSessionEndpoint = discoveryDocument.end_session_endpoint
  if (!endSessionEndpoint) return getLocalSignedOutRedirect()

  const logoutUrl = new URL(endSessionEndpoint)
  logoutUrl.searchParams.set('id_token_hint', idToken)
  logoutUrl.searchParams.set('post_logout_redirect_uri', nextServerConfig.oneLogin.postLogoutRedirectUri)

  return logoutUrl
}

export async function GET(request: NextRequest) {
  const sessionId = request.cookies.get(appSessionCookieName)?.value
  const session = sessionId ? await getAuthenticatedUserSession(sessionId) : null

  if (sessionId) {
    await deleteAuthenticatedUserSession(sessionId)
  }

  const response = NextResponse.redirect(await getOneLoginLogoutUrl(session?.idToken))
  clearAppSessionCookie(response.cookies)

  return response
}
