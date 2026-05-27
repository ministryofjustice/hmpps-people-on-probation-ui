import { createClient } from 'redis'

import logger from '../../logger'
import config from '../config'

export type RedisClient = ReturnType<typeof createClient>

function buildRedisUrl(): string {
  const protocol = config.redis.tls_enabled === 'true' ? 'rediss' : 'redis'
  return `${protocol}://${config.redis.host}:${config.redis.port}`
}

export const createRedisClient = (): RedisClient => {
  const client = createClient({
    url: buildRedisUrl(),
    password: config.redis.password,
    socket: {
      reconnectStrategy: (attempts: number) => {
        const nextDelay = Math.min(2 ** attempts * 20, 30000)
        logger.info(`Retry Redis connection attempt: ${attempts}, next attempt in: ${nextDelay}ms`)
        return nextDelay
      },
    },
  })

  client.on('error', (e: Error) => logger.error('Redis client error', e))

  return client
}

let sharedRedisClient: RedisClient | null = null

export function getRedisClient(): RedisClient {
  if (sharedRedisClient) return sharedRedisClient

  sharedRedisClient = createRedisClient()
  sharedRedisClient.connect().catch((err: Error) => logger.error('Failed to connect shared Redis client', err))

  return sharedRedisClient
}
