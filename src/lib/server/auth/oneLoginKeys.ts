import 'server-only'

import { createPublicKey, KeyObject } from 'crypto'
import { nextServerConfig } from '../config'

export type OneLoginPublicJwk = JsonWebKey & {
  kid: string
  use: 'sig'
}

function decodeBase64(value: string): string {
  return Buffer.from(value, 'base64').toString('utf8')
}

function publicKeyObjectFromConfig(): KeyObject {
  const { privateKeyBase64, publicKeyBase64 } = nextServerConfig.oneLogin
  const configuredPublicKey = publicKeyBase64 && decodeBase64(publicKeyBase64)

  if (configuredPublicKey) {
    return createPublicKey(configuredPublicKey)
  }

  const configuredPrivateKey = privateKeyBase64 && decodeBase64(privateKeyBase64)
  if (configuredPrivateKey) {
    return createPublicKey(configuredPrivateKey)
  }

  throw new Error('One Login public key is not configured')
}

function normalisePublicJwk(jwk: JsonWebKey, keyId: string): OneLoginPublicJwk {
  if (!keyId) {
    throw new Error('ONE_LOGIN_KEY_ID is required to expose the One Login JWKS')
  }

  if (jwk.kty !== 'RSA') {
    throw new Error('One Login JWKS key must be an RSA key')
  }

  if (!jwk.n || !jwk.e) {
    throw new Error('One Login JWKS key must include modulus and exponent')
  }

  return {
    kty: 'RSA',
    n: jwk.n,
    e: jwk.e,
    kid: keyId,
    use: 'sig',
  }
}

export function getOneLoginPublicJwk(): OneLoginPublicJwk {
  const publicKeyObject = publicKeyObjectFromConfig()
  const jwk = publicKeyObject.export({ format: 'jwk' })

  return normalisePublicJwk(jwk, nextServerConfig.oneLogin.keyId)
}

export function getOneLoginPrivateKey(): string {
  const { privateKeyBase64 } = nextServerConfig.oneLogin
  const configuredPrivateKey = privateKeyBase64 && decodeBase64(privateKeyBase64)

  if (!configuredPrivateKey) {
    throw new Error('One Login private key is not configured')
  }

  return configuredPrivateKey
}
