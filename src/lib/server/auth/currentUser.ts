import 'server-only'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { appSessionCookieName } from './cookies'
import { getAuthenticatedUserSession } from './sessionStore'

export async function getCurrentUser() {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(appSessionCookieName)?.value

  if (!sessionId) return null

  return getAuthenticatedUserSession(sessionId)
}

function normaliseReturnTo(returnTo: string) {
  if (!returnTo.startsWith('/') || returnTo.startsWith('//')) return '/dashboard'
  return returnTo
}

export async function requireCurrentUser(returnTo = '/dashboard') {
  const user = await getCurrentUser()

  if (!user) {
    redirect(`/?returnTo=${encodeURIComponent(normaliseReturnTo(returnTo))}`)
  }

  return user
}
