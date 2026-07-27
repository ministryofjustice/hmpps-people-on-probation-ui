import { randomUUID } from 'crypto'
import { getRedisClient } from '../data/redisClient'
import config from '../config'
import type { RegisteredUserResponse } from '../data/peopleOnProbationApiClient'

// Details of the CRN being previewed, minted by the admin "preview as user"
// feature (server/routes/admin.ts) — deliberately its own type, not
// RegisteredUserResponse, since this never came from a real registration.
export interface AdminPreviewSubjectDetails {
  personReference: string
  startedAt: string
}

export type AuthenticatedUserSession = {
  id: string
  userId: string
  email?: string
  phoneNumber?: string
  displayName?: string
  idToken?: string
  registeredUserDetails?: RegisteredUserResponse
  // True only for the authenticated session created by completing a
  // registration invite. This avoids inferring the first registration
  // session from timestamps that the API updates during later sign-ins.
  isRegistrationSession?: boolean
  authenticatedAt: number
  expiresAt: number
  // Set only on synthetic sessions minted by the admin "preview as user"
  // feature (server/routes/admin.ts) — the HMPPS Auth username of the admin
  // who started the preview. Absent on every real citizen One Login session.
  previewedByAdmin?: string
  // Set only alongside previewedByAdmin — the CRN being previewed. Kept
  // separate from registeredUserDetails (a real registration record) rather
  // than faked into that field. Use getSessionCrn() to read "the CRN for
  // this session" regardless of whether it's a citizen or admin-preview one.
  adminPreviewSubject?: AdminPreviewSubjectDetails
}

// The single place that resolves "what CRN is this session for" — a real
// citizen session (registeredUserDetails) or an admin preview session
// (adminPreviewSubject). Every route that needs the current CRN should go
// through this rather than reading either field directly.
export function getSessionCrn(
  session: Pick<AuthenticatedUserSession, 'registeredUserDetails' | 'adminPreviewSubject'> | undefined | null,
): string | undefined {
  return session?.registeredUserDetails?.personReference ?? session?.adminPreviewSubject?.personReference
}

const redisKeyPrefix = 'app:session'
const inMemorySessions = new Map<string, { session: AuthenticatedUserSession; expiresAt: number }>()

function getRedisKey(sessionId: string) {
  return `${redisKeyPrefix}:${sessionId}`
}

function getSessionTtlSeconds() {
  return config.session.expiryMinutes * 60
}

function pruneExpiredInMemorySessions() {
  const now = Date.now()
  for (const [key, value] of inMemorySessions.entries()) {
    if (value.expiresAt <= now) {
      inMemorySessions.delete(key)
    }
  }
}

export function createAuthenticatedUserSession(
  user: Pick<
    AuthenticatedUserSession,
    | 'userId'
    | 'email'
    | 'phoneNumber'
    | 'displayName'
    | 'idToken'
    | 'registeredUserDetails'
    | 'isRegistrationSession'
    | 'previewedByAdmin'
    | 'adminPreviewSubject'
  >,
): AuthenticatedUserSession {
  const now = Date.now()

  return {
    id: randomUUID(),
    ...user,
    authenticatedAt: now,
    expiresAt: now + getSessionTtlSeconds() * 1000,
  }
}

export async function saveAuthenticatedUserSession(session: AuthenticatedUserSession) {
  const ttlSeconds = getSessionTtlSeconds()

  if (config.redis.enabled) {
    await getRedisClient().setEx(getRedisKey(session.id), ttlSeconds, JSON.stringify(session))
    return
  }

  pruneExpiredInMemorySessions()
  inMemorySessions.set(session.id, {
    session,
    expiresAt: Date.now() + ttlSeconds * 1000,
  })
}

export async function refreshAuthenticatedUserSession(sessionId: string) {
  const session = await getAuthenticatedUserSession(sessionId)
  if (!session) return null

  const refreshedSession: AuthenticatedUserSession = {
    ...session,
    expiresAt: Date.now() + getSessionTtlSeconds() * 1000,
  }

  await saveAuthenticatedUserSession(refreshedSession)
  return refreshedSession
}

export async function getAuthenticatedUserSession(sessionId: string) {
  if (config.redis.enabled) {
    const storedSession = await getRedisClient().get(getRedisKey(sessionId))
    return storedSession ? (JSON.parse(storedSession.toString()) as AuthenticatedUserSession) : null
  }

  pruneExpiredInMemorySessions()
  return inMemorySessions.get(sessionId)?.session ?? null
}

export async function deleteAuthenticatedUserSession(sessionId: string) {
  if (config.redis.enabled) {
    await getRedisClient().del(getRedisKey(sessionId))
    return
  }

  inMemorySessions.delete(sessionId)
}

export function getAuthenticatedUserSessionTtlSeconds() {
  return getSessionTtlSeconds()
}
