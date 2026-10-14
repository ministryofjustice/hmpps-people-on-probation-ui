import { AuthenticationClient, InMemoryTokenStore, RedisTokenStore } from '@ministryofjustice/hmpps-auth-clients'
import applicationInfoSupplier from '../applicationInfo'
import { createRedisClient } from './redisClient'
import config from '../config'
import logger from '../../logger'
import PeopleOnProbationApiClient from './peopleOnProbationApiClient'

const applicationInfo = applicationInfoSupplier()

let authenticationClient: AuthenticationClient | null = null

export function getAuthenticationClient(): AuthenticationClient {
  if (authenticationClient) return authenticationClient

  authenticationClient = new AuthenticationClient(
    config.apis.hmppsAuth,
    logger,
    config.redis.enabled ? new RedisTokenStore(createRedisClient()) : new InMemoryTokenStore(),
  )

  return authenticationClient
}

export const dataAccess = () => {
  const hmppsAuthClient = getAuthenticationClient()

  return {
    applicationInfo,
    hmppsAuthClient,
    peopleOnProbationApiClient: new PeopleOnProbationApiClient(hmppsAuthClient),
  }
}

export type DataAccess = ReturnType<typeof dataAccess>

export { AuthenticationClient, PeopleOnProbationApiClient }
