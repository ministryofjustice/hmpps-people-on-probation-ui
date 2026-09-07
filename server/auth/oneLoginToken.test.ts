import { authenticateOneLoginCallback } from './oneLoginToken'
import { OneLoginTransaction } from './loginTransactionStore'
import config from '../config'

jest.mock('./oneLoginDiscovery', () => ({
  getOneLoginDiscoveryDocument: jest.fn().mockResolvedValue({
    issuer: 'https://oidc.example.gov.uk',
    authorization_endpoint: 'https://oidc.example.gov.uk/authorize',
    token_endpoint: 'https://oidc.example.gov.uk/token',
    userinfo_endpoint: 'https://oidc.example.gov.uk/userinfo',
    jwks_uri: 'https://oidc.example.gov.uk/.well-known/jwks.json',
  }),
}))

jest.mock('./oneLoginKeys', () => ({
  getOneLoginPrivateKey: jest.fn().mockReturnValue('unused-in-this-test'),
}))

let mockedVerifiedPayload: Record<string, unknown>

// jose is ESM-only and isn't transformed by this project's ts-jest setup, so stub out the
// pieces this module uses rather than exercising real key import/signing/verification.
jest.mock('jose', () => ({
  importPKCS8: jest.fn().mockResolvedValue('fake-key'),
  SignJWT: jest.fn().mockImplementation(() => ({
    setProtectedHeader: jest.fn().mockReturnThis(),
    sign: jest.fn().mockResolvedValue('fake-client-assertion'),
  })),
  createRemoteJWKSet: jest.fn().mockReturnValue('fake-jwks'),
  jwtVerify: jest.fn().mockImplementation(() => Promise.resolve({ payload: mockedVerifiedPayload })),
}))

function baseTransaction(registrationInviteToken?: string): OneLoginTransaction {
  return {
    id: 'transaction-id',
    state: 'state-value',
    nonce: 'nonce-value',
    codeVerifier: 'code-verifier',
    codeChallenge: 'code-challenge',
    returnTo: '/',
    registrationInviteToken,
    createdAt: Date.now(),
  }
}

describe('authenticateOneLoginCallback vector of trust checks', () => {
  const originalOneLogin = { ...config.oneLogin }
  const originalFetch = global.fetch

  beforeEach(() => {
    config.oneLogin = {
      ...originalOneLogin,
      clientId: 'test-client-id',
      keyId: 'test-key-id',
      redirectUri: 'https://example.gov.uk/sign-in/callback',
      vtr: 'Cl.Cm',
      vtrLogin: 'Cl',
    }

    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.endsWith('/token')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id_token: 'fake-id-token', token_type: 'Bearer' }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    config.oneLogin = { ...originalOneLogin }
    global.fetch = originalFetch
  })

  it('accepts a registration callback whose vot matches the registration vtr', async () => {
    mockedVerifiedPayload = { sub: 'user-1', nonce: 'nonce-value', iat: Math.floor(Date.now() / 1000), vot: 'Cl.Cm' }

    const result = await authenticateOneLoginCallback('auth-code', baseTransaction('invite-token'))

    expect(result.userId).toBe('user-1')
  })

  it('rejects a registration callback whose vot matches only the (lower) login vtr', async () => {
    mockedVerifiedPayload = { sub: 'user-1', nonce: 'nonce-value', iat: Math.floor(Date.now() / 1000), vot: 'Cl' }

    await expect(authenticateOneLoginCallback('auth-code', baseTransaction('invite-token'))).rejects.toThrow(
      'One Login ID token vector of trust did not match the requested authentication level',
    )
  })

  it('accepts a login callback whose vot matches the (lower) login vtr', async () => {
    mockedVerifiedPayload = { sub: 'user-1', nonce: 'nonce-value', iat: Math.floor(Date.now() / 1000), vot: 'Cl' }

    const result = await authenticateOneLoginCallback('auth-code', baseTransaction())

    expect(result.userId).toBe('user-1')
  })

  it('rejects a login callback whose vot does not match the login vtr', async () => {
    mockedVerifiedPayload = { sub: 'user-1', nonce: 'nonce-value', iat: Math.floor(Date.now() / 1000), vot: 'Cl.Cm' }

    await expect(authenticateOneLoginCallback('auth-code', baseTransaction())).rejects.toThrow(
      'One Login ID token vector of trust did not match the requested authentication level',
    )
  })
})
