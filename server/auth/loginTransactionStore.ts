import { createHash, randomBytes, randomUUID } from 'crypto'
import { getRedisClient } from '../data/redisClient'
import config from '../config'

export type OneLoginTransaction = {
  id: string
  state: string
  nonce: string
  codeVerifier: string
  codeChallenge: string
  returnTo: string
  registrationInviteToken?: string
  createdAt: number
}

const transactionTtlSeconds = 10 * 60
const redisKeyPrefix = 'one-login:transaction'
const inMemoryTransactions = new Map<string, { transaction: OneLoginTransaction; expiresAt: number }>()

function randomBase64Url(bytes = 32) {
  return randomBytes(bytes).toString('base64url')
}

function createCodeChallenge(codeVerifier: string) {
  return createHash('sha256').update(codeVerifier).digest('base64url')
}

function getRedisKey(transactionId: string) {
  return `${redisKeyPrefix}:${transactionId}`
}

function pruneExpiredInMemoryTransactions() {
  const now = Date.now()
  for (const [key, value] of inMemoryTransactions.entries()) {
    if (value.expiresAt <= now) {
      inMemoryTransactions.delete(key)
    }
  }
}

function normaliseReturnTo(returnTo?: string | null) {
  if (!returnTo?.startsWith('/') || returnTo.startsWith('//')) return '/'
  return returnTo
}

export function createOneLoginTransaction(
  returnTo?: string | null,
  registrationInviteToken?: string,
): OneLoginTransaction {
  const codeVerifier = randomBase64Url(64)

  return {
    id: randomUUID(),
    state: randomBase64Url(),
    nonce: randomBase64Url(),
    codeVerifier,
    codeChallenge: createCodeChallenge(codeVerifier),
    returnTo: normaliseReturnTo(returnTo),
    registrationInviteToken,
    createdAt: Date.now(),
  }
}

export async function saveOneLoginTransaction(transaction: OneLoginTransaction) {
  if (config.redis.enabled) {
    await getRedisClient().setEx(getRedisKey(transaction.id), transactionTtlSeconds, JSON.stringify(transaction))
    return
  }

  pruneExpiredInMemoryTransactions()
  inMemoryTransactions.set(transaction.id, {
    transaction,
    expiresAt: Date.now() + transactionTtlSeconds * 1000,
  })
}

export async function getOneLoginTransaction(transactionId: string) {
  if (config.redis.enabled) {
    const storedTransaction = await getRedisClient().get(getRedisKey(transactionId))
    return storedTransaction ? (JSON.parse(storedTransaction.toString()) as OneLoginTransaction) : null
  }

  pruneExpiredInMemoryTransactions()
  return inMemoryTransactions.get(transactionId)?.transaction ?? null
}

export async function deleteOneLoginTransaction(transactionId: string) {
  if (config.redis.enabled) {
    await getRedisClient().del(getRedisKey(transactionId))
    return
  }

  inMemoryTransactions.delete(transactionId)
}

export function getOneLoginTransactionTtlSeconds() {
  return transactionTtlSeconds
}
