import config from '../config'
import logger from '../../logger'

export type OneLoginDiscoveryDocument = {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint: string
  jwks_uri: string
  end_session_endpoint?: string
}

let cachedDiscoveryDocument: {
  document: OneLoginDiscoveryDocument
  expiresAt: number
} | null = null

function getDiscoveryUrl() {
  const issuerUrl = config.oneLogin.issuerUrl.replace(/\/$/, '')

  if (!issuerUrl) {
    throw new Error('ONE_LOGIN_ISSUER_URL is required to start a One Login journey')
  }

  return `${issuerUrl}/.well-known/openid-configuration`
}

function getCacheTtlSeconds(cacheControl: string | null) {
  const maxAge = cacheControl?.match(/max-age=(\d+)/)?.[1]
  return maxAge ? Number(maxAge) : 24 * 60 * 60
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isAbsoluteUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function assertValidDiscoveryDocument(value: unknown): asserts value is OneLoginDiscoveryDocument {
  if (!value || typeof value !== 'object') {
    throw new Error('One Login discovery document is not an object')
  }

  const document = value as Partial<OneLoginDiscoveryDocument>
  const requiredUrlFields: Array<keyof OneLoginDiscoveryDocument> = [
    'issuer',
    'authorization_endpoint',
    'token_endpoint',
    'userinfo_endpoint',
    'jwks_uri',
  ]

  for (const field of requiredUrlFields) {
    if (!isNonEmptyString(document[field]) || !isAbsoluteUrl(document[field])) {
      throw new Error(`One Login discovery document is missing or has invalid ${field}`)
    }
  }

  if (document.end_session_endpoint && !isAbsoluteUrl(document.end_session_endpoint)) {
    throw new Error('One Login discovery document has invalid end_session_endpoint')
  }
}

export async function getOneLoginDiscoveryDocument() {
  if (cachedDiscoveryDocument && cachedDiscoveryDocument.expiresAt > Date.now()) {
    return cachedDiscoveryDocument.document
  }

  try {
    const response = await fetch(getDiscoveryUrl(), {
      headers: {
        'User-Agent': 'hmpps-people-on-probation-ui',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to retrieve One Login discovery document: ${response.status}`)
    }

    const document = await response.json()
    assertValidDiscoveryDocument(document)

    cachedDiscoveryDocument = {
      document,
      expiresAt: Date.now() + getCacheTtlSeconds(response.headers.get('cache-control')) * 1000,
    }
  } catch (error) {
    if (!cachedDiscoveryDocument) {
      logger.warn({ err: error }, 'Failed to fetch One Login discovery document and no cached copy is available')
      throw error
    }

    logger.warn({ err: error }, 'Failed to refresh One Login discovery document; falling back to stale cached copy')
  }

  return cachedDiscoveryDocument.document
}
