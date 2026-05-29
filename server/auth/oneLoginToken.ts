import { randomUUID } from 'crypto'
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'jose'
import { OneLoginTransaction } from './loginTransactionStore'
import { getOneLoginDiscoveryDocument, OneLoginDiscoveryDocument } from './oneLoginDiscovery'
import { getOneLoginPrivateKey } from './oneLoginKeys'
import config from '../config'

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
    throw new Error(`Failed to exchange One Login authorisation code: ${response.status}`)
  }

  return {
    discoveryDocument,
    tokenResponse: (await response.json()) as OneLoginTokenResponse,
  }
}

async function verifyIdToken(idToken: string, nonce: string, discoveryDocument: OneLoginDiscoveryDocument) {
  const clientId = getRequiredClientId()
  const jwks = createRemoteJWKSet(new URL(discoveryDocument.jwks_uri))
  const { payload } = await jwtVerify(idToken, jwks, {
    audience: clientId,
    issuer: discoveryDocument.issuer,
  })

  if (payload.nonce !== nonce) {
    throw new Error('One Login ID token nonce did not match the login transaction')
  }

  if (!payload.sub) {
    throw new Error('One Login ID token did not include a subject')
  }

  if (!payload.iat || payload.iat > Math.floor(Date.now() / 1000) + clockSkewToleranceSeconds) {
    throw new Error('One Login ID token issued-at time is invalid')
  }

  const expectedVot = getExpectedVectorOfTrust()
  if (payload.vot !== expectedVot) {
    throw new Error('One Login ID token vector of trust did not match the requested authentication level')
  }

  return payload
}

function getExpectedVectorOfTrust() {
  const requestedVectorOfTrust = config.oneLogin.vtr.split(',')[0].trim()
  const [credentialTrust, credentialTrustLevel] = requestedVectorOfTrust.split('.')

  return credentialTrust === 'Cl' && credentialTrustLevel
    ? `${credentialTrust}.${credentialTrustLevel}`
    : requestedVectorOfTrust
}

async function getUserInfo(accessToken: string | undefined, discoveryDocument: OneLoginDiscoveryDocument) {
  if (!accessToken) return null

  const response = await fetch(discoveryDocument.userinfo_endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'hmpps-people-on-probation-ui',
    },
  })

  if (!response.ok) {
    return null
  }

  return (await response.json()) as OneLoginUserInfo
}

export async function authenticateOneLoginCallback(code: string, transaction: OneLoginTransaction) {
  const { discoveryDocument, tokenResponse } = await exchangeCodeForTokens(code, transaction)
  const idTokenPayload = await verifyIdToken(tokenResponse.id_token, transaction.nonce, discoveryDocument)
  const userInfo = await getUserInfo(tokenResponse.access_token, discoveryDocument)

  return {
    userId: idTokenPayload.sub,
    email: userInfo?.email,
    phoneNumber: userInfo?.phone_number,
    displayName: userInfo?.name,
    idToken: tokenResponse.id_token,
  } satisfies OneLoginAuthenticatedUser
}
