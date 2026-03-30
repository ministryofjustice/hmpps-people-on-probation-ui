import 'server-only'

import { createClient } from 'redis'
import logger from '../../../../logger'
import { nextServerConfig } from '../config'

export type RedisClient = ReturnType<typeof createClient>

let redisClient: RedisClient | null = null

function createRedisUrl() {
  const protocol = nextServerConfig.redis.tlsEnabled ? 'rediss' : 'redis'
  return `${protocol}://${nextServerConfig.redis.host}:${nextServerConfig.redis.port}`
}

export function getRedisClient() {
  if (redisClient) return redisClient

  redisClient = createClient({
    url: createRedisUrl(),
    password: nextServerConfig.redis.password,
    socket: {
      reconnectStrategy: (attempts: number) => Math.min(2 ** attempts * 20, 30000),
    },
  })

  redisClient.on('error', (error: Error) => {
    logger.error(error, 'Redis client error')
  })

  void redisClient.connect().catch((error: Error) => {
    logger.error(error, 'Failed to connect Redis client')
  })

  return redisClient
}
