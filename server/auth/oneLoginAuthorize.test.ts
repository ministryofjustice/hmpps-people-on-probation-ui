import buildOneLoginAuthorizeUrl from './oneLoginAuthorize'
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

// jose is ESM-only and isn't transformed by this project's ts-jest setup, so replace it with a
// stub that captures the signed payload as JSON instead of doing real key import/signing.
jest.mock('jose', () => ({
  importPKCS8: jest.fn().mockResolvedValue('fake-key'),
  SignJWT: jest.fn().mockImplementation((payload: Record<string, unknown>) => ({
    setProtectedHeader: jest.fn().mockReturnThis(),
    sign: jest.fn().mockResolvedValue(JSON.stringify(payload)),
  })),
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

function requestedVtr(authorizeUrl: URL): string[] {
  const requestJwt = authorizeUrl.searchParams.get('request') as string
  return (JSON.parse(requestJwt) as { vtr: string[] }).vtr
}

describe('buildOneLoginAuthorizeUrl', () => {
  const originalOneLogin = { ...config.oneLogin }

  beforeEach(() => {
    config.oneLogin = {
      ...originalOneLogin,
      clientId: 'test-client-id',
      keyId: 'test-key-id',
      redirectUri: 'https://example.gov.uk/sign-in/callback',
      scopes: 'openid email phone',
      vtr: 'Cl',
    }
  })

  afterEach(() => {
    config.oneLogin = { ...originalOneLogin }
  })

  it('requests the configured vtr for a registration transaction', async () => {
    const authorizeUrl = await buildOneLoginAuthorizeUrl(baseTransaction('invite-token'))

    expect(requestedVtr(authorizeUrl)).toEqual(['Cl'])
  })

  it('requests the same configured vtr for a login transaction', async () => {
    const authorizeUrl = await buildOneLoginAuthorizeUrl(baseTransaction())

    expect(requestedVtr(authorizeUrl)).toEqual(['Cl'])
  })
})
