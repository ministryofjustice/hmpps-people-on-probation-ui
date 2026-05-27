import { importPKCS8, SignJWT } from 'jose'
import { OneLoginTransaction } from './loginTransactionStore'
import { getOneLoginPrivateKey } from './oneLoginKeys'
import { getOneLoginDiscoveryDocument } from './oneLoginDiscovery'
import config from '../config'

type AuthorizeRequestObject = {
  aud: string
  iss: string
  response_type: 'code'
  client_id: string
  redirect_uri: string
  scope: string
  state: string
  nonce: string
  vtr: string[]
  ui_locales: 'en'
  code_challenge: string
  code_challenge_method: 'S256'
}

async function signJwt(payload: AuthorizeRequestObject) {
  const privateKey = await importPKCS8(getOneLoginPrivateKey(), 'RS256')

  return new SignJWT(payload)
    .setProtectedHeader({
      alg: 'RS256',
      typ: 'JWT',
      kid: config.oneLogin.keyId,
    })
    .sign(privateKey)
}

function getRequiredOneLoginConfig() {
  const { clientId, keyId, redirectUri, scopes, vtr } = config.oneLogin

  if (!clientId) throw new Error('ONE_LOGIN_CLIENT_ID is required to start a One Login journey')
  if (!keyId) throw new Error('ONE_LOGIN_KEY_ID is required to start a One Login journey')
  if (!redirectUri) throw new Error('ONE_LOGIN_REDIRECT_URI is required to start a One Login journey')
  if (!scopes.includes('openid')) throw new Error('ONE_LOGIN_SCOPES must include openid')

  return {
    clientId,
    redirectUri,
    scopes,
    vtr: vtr
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
  }
}

export async function buildOneLoginAuthorizeUrl(transaction: OneLoginTransaction) {
  const { authorization_endpoint: authorizationEndpoint } = await getOneLoginDiscoveryDocument()
  const { clientId, redirectUri, scopes, vtr } = getRequiredOneLoginConfig()

  const requestObject = await signJwt({
    aud: authorizationEndpoint,
    iss: clientId,
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
    state: transaction.state,
    nonce: transaction.nonce,
    vtr,
    ui_locales: 'en',
    code_challenge: transaction.codeChallenge,
    code_challenge_method: 'S256',
  })

  const authorizeUrl = new URL(authorizationEndpoint)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('scope', scopes)
  authorizeUrl.searchParams.set('client_id', clientId)
  authorizeUrl.searchParams.set('request', requestObject)

  return authorizeUrl
}
