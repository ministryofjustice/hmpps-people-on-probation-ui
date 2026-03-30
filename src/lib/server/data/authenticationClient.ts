import 'server-only'

import { AuthenticationClient, InMemoryTokenStore, RedisTokenStore } from '@ministryofjustice/hmpps-auth-clients'
import logger from '../../../../logger'
import { nextServerConfig } from '../config'
import { getRedisClient } from './redisClient'

let authenticationClient: AuthenticationClient | null = null

function createTokenStore() {
  if (nextServerConfig.redis.enabled) {
    return new RedisTokenStore(getRedisClient())
  }

  return new InMemoryTokenStore()
}

export function createAuthenticationClient() {
  if (authenticationClient) return authenticationClient

  authenticationClient = new AuthenticationClient(nextServerConfig.apis.hmppsAuth, logger, createTokenStore())
  return authenticationClient
}
