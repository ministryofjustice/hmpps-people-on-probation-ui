import config from '../config'

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

    const document = (await response.json()) as OneLoginDiscoveryDocument
    cachedDiscoveryDocument = {
      document,
      expiresAt: Date.now() + getCacheTtlSeconds(response.headers.get('cache-control')) * 1000,
    }
  } catch (error) {
    if (!cachedDiscoveryDocument) {
      throw error
    }
  }

  return cachedDiscoveryDocument.document
}
