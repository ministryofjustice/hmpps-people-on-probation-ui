import 'server-only'

import { randomUUID } from 'crypto'
import { getRedisClient } from '../data/redisClient'
import { nextServerConfig } from '../config'
import type { RegisteredUserResponse } from '../data/peopleOnProbationApiClient'

export type AuthenticatedUserSession = {
  id: string
  userId: string
  email?: string
  phoneNumber?: string
  displayName?: string
  idToken?: string
  registeredUserDetails?: RegisteredUserResponse
  authenticatedAt: number
  expiresAt: number
}

const redisKeyPrefix = 'app:session'
const inMemorySessions = new Map<string, { session: AuthenticatedUserSession; expiresAt: number }>()

function getRedisKey(sessionId: string) {
  return `${redisKeyPrefix}:${sessionId}`
}

function getSessionTtlSeconds() {
  return nextServerConfig.session.expiryMinutes * 60
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
    'userId' | 'email' | 'phoneNumber' | 'displayName' | 'idToken' | 'registeredUserDetails'
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

  if (nextServerConfig.redis.enabled) {
    await getRedisClient().setEx(getRedisKey(session.id), ttlSeconds, JSON.stringify(session))
    return
  }

  pruneExpiredInMemorySessions()
  inMemorySessions.set(session.id, {
    session,
    expiresAt: Date.now() + ttlSeconds * 1000,
  })
}

export async function getAuthenticatedUserSession(sessionId: string) {
  if (nextServerConfig.redis.enabled) {
    const storedSession = await getRedisClient().get(getRedisKey(sessionId))
    return storedSession ? (JSON.parse(storedSession.toString()) as AuthenticatedUserSession) : null
  }

  pruneExpiredInMemorySessions()
  return inMemorySessions.get(sessionId)?.session ?? null
}

export async function deleteAuthenticatedUserSession(sessionId: string) {
  if (nextServerConfig.redis.enabled) {
    await getRedisClient().del(getRedisKey(sessionId))
    return
  }

  inMemorySessions.delete(sessionId)
}

export function getAuthenticatedUserSessionTtlSeconds() {
  return getSessionTtlSeconds()
}
