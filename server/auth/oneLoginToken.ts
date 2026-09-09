import { randomUUID } from 'crypto'
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'jose'
import { OneLoginTransaction } from './loginTransactionStore'
import { getOneLoginDiscoveryDocument, OneLoginDiscoveryDocument } from './oneLoginDiscovery'
import { getOneLoginPrivateKey } from './oneLoginKeys'
import config from '../config'
import logger from '../../logger'

type OneLoginTokenResponse = {
  access_token?: string
  expires_in?: number
  id_token: string
  token_type: 'Bearer'
}

export type OneLoginAuthenticatedUser = {
  userId: string
  email?: string
  phoneNumber?: string
  displayName?: string
  idToken: string
}

type OneLoginUserInfo = {
  sub?: string
  email?: string
  phone_number?: string
  name?: string
}

const clockSkewToleranceSeconds = 30

function getRequiredClientId() {
  const { clientId } = config.oneLogin
  if (!clientId) throw new Error('ONE_LOGIN_CLIENT_ID is required to complete a One Login journey')
  return clientId
}

async function createClientAssertion(discoveryDocument: OneLoginDiscoveryDocument) {
  const clientId = getRequiredClientId()
  const privateKey = await importPKCS8(getOneLoginPrivateKey(), 'RS256')
  const nowInSeconds = Math.floor(Date.now() / 1000)

  return new SignJWT({
    aud: discoveryDocument.token_endpoint,
    iss: clientId,
    sub: clientId,
    exp: nowInSeconds + 5 * 60,
    iat: nowInSeconds,
    jti: randomUUID(),
  })
    .setProtectedHeader({
      alg: 'RS256',
      typ: 'JWT',
      kid: config.oneLogin.keyId,
    })
    .sign(privateKey)
}

async function exchangeCodeForTokens(code: string, transaction: OneLoginTransaction) {
  const discoveryDocument = await getOneLoginDiscoveryDocument()
  const clientAssertion = await createClientAssertion(discoveryDocument)
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.oneLogin.redirectUri,
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: clientAssertion,
    code_verifier: transaction.codeVerifier,
  })

  const response = await fetch(discoveryDocument.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'hmpps-people-on-probation-ui',
    },
    body,
  })

  if (!response.ok) {
    logger.warn({ transactionId: transaction.id, status: response.status }, 'One Login token exchange request failed')
    throw new Error(`Failed to exchange One Login authorisation code: ${response.status}`)
  }

  return {
    discoveryDocument,
    tokenResponse: (await response.json()) as OneLoginTokenResponse,
  }
}

async function verifyIdToken(
  idToken: string,
  nonce: string,
  discoveryDocument: OneLoginDiscoveryDocument,
  transactionId: string,
) {
  const clientId = getRequiredClientId()
  const jwks = createRemoteJWKSet(new URL(discoveryDocument.jwks_uri))
  const { payload } = await jwtVerify(idToken, jwks, {
    audience: clientId,
    issuer: discoveryDocument.issuer,
  })

  if (payload.nonce !== nonce) {
    logger.warn({ transactionId, oneLoginSubject: payload.sub }, 'One Login ID token nonce mismatch')
    throw new Error('One Login ID token nonce did not match the login transaction')
  }

  if (!payload.sub) {
    logger.warn({ transactionId }, 'One Login ID token missing subject')
    throw new Error('One Login ID token did not include a subject')
  }

  if (!payload.iat || payload.iat > Math.floor(Date.now() / 1000) + clockSkewToleranceSeconds) {
    logger.warn({ transactionId, oneLoginSubject: payload.sub }, 'One Login ID token issued-at time is invalid')
    throw new Error('One Login ID token issued-at time is invalid')
  }

  const requiredVot = getRequiredVectorOfTrust()
  if (!meetsRequiredVectorOfTrust(payload.vot, requiredVot)) {
    logger.warn(
      { transactionId, oneLoginSubject: payload.sub, requiredVot, actualVot: payload.vot },
      'One Login ID token vector of trust did not meet the required authentication level',
    )
    throw new Error('One Login ID token vector of trust did not match the requested authentication level')
  }

  return payload
}

// The two authentication-only vectors of trust this client can request, ranked by
// credential trust strength. 'Cl' (single factor) is weaker than 'Cl.Cm' (single factor +
// MFA). GOV.UK One Login's docs don't settle whether a returned vot can exceed what was
// requested, but rejecting a stronger vot has no security upside - it only means the user
// authenticated more strongly than required, e.g. an existing MFA session reused from
// another service, or the mandatory second-factor setup every new One Login account goes
// through. So this accepts anything at or above what was requested, not only an exact
// match. Any vot outside this table (including undefined) fails closed: it's rejected
// rather than assumed to be acceptable.
const VECTOR_OF_TRUST_RANK: Record<string, number> = {
  Cl: 0,
  'Cl.Cm': 1,
}

function getRequiredVectorOfTrust(): string {
  return config.oneLogin.vtr.split(',')[0].trim()
}

function meetsRequiredVectorOfTrust(actualVot: unknown, requiredVot: string): boolean {
  if (typeof actualVot !== 'string') return false

  const actualRank = VECTOR_OF_TRUST_RANK[actualVot]
  const requiredRank = VECTOR_OF_TRUST_RANK[requiredVot]

  return actualRank !== undefined && requiredRank !== undefined && actualRank >= requiredRank
}

async function getUserInfo(
  accessToken: string | undefined,
  discoveryDocument: OneLoginDiscoveryDocument,
  transactionId: string,
) {
  if (!accessToken) return null

  const response = await fetch(discoveryDocument.userinfo_endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'hmpps-people-on-probation-ui',
    },
  })

  if (!response.ok) {
    logger.warn({ transactionId, status: response.status }, 'One Login userinfo request failed')
    return null
  }

  return (await response.json()) as OneLoginUserInfo
}

export async function authenticateOneLoginCallback(code: string, transaction: OneLoginTransaction) {
  const { discoveryDocument, tokenResponse } = await exchangeCodeForTokens(code, transaction)
  const idTokenPayload = await verifyIdToken(
    tokenResponse.id_token,
    transaction.nonce,
    discoveryDocument,
    transaction.id,
  )
  const userInfo = await getUserInfo(tokenResponse.access_token, discoveryDocument, transaction.id)

  return {
    userId: idTokenPayload.sub,
    email: userInfo?.email,
    phoneNumber: userInfo?.phone_number,
    displayName: userInfo?.name,
    idToken: tokenResponse.id_token,
  } satisfies OneLoginAuthenticatedUser
}
