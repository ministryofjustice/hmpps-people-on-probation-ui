import { GET } from './route'
import { createOneLoginTransaction, saveOneLoginTransaction } from '../../../../lib/server/auth/loginTransactionStore'
import { buildOneLoginAuthorizeUrl } from '../../../../lib/server/auth/oneLoginAuthorize'
import { getPeopleOnProbationService } from '../../../../lib/server/services/peopleOnProbationService'

jest.mock('../../../../lib/server/auth/loginTransactionStore', () => ({
  createOneLoginTransaction: jest.fn((_returnTo: string | null, registrationInviteToken?: string) => ({
    id: 'transaction-id',
    state: 'state',
    nonce: 'nonce',
    codeVerifier: 'code-verifier',
    codeChallenge: 'code-challenge',
    returnTo: '/dashboard',
    registrationInviteToken,
    createdAt: 1,
  })),
  getOneLoginTransactionTtlSeconds: jest.fn(() => 600),
  saveOneLoginTransaction: jest.fn(),
}))

jest.mock('../../../../lib/server/auth/oneLoginAuthorize', () => ({
  buildOneLoginAuthorizeUrl: jest.fn(() => new URL('https://oidc.integration.account.gov.uk/authorize')),
}))

jest.mock('../../../../lib/server/services/peopleOnProbationService', () => ({
  getPeopleOnProbationService: jest.fn(),
}))

jest.mock('../../../../lib/server/auth/redirects', () => ({
  getApplicationRedirectUrl: jest.fn((path: string) => new URL(path, 'https://example.test')),
}))

describe('/sign-in/start', () => {
  const validateRegistrationInvite = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    ;(getPeopleOnProbationService as jest.Mock).mockReturnValue({ validateRegistrationInvite })
  })

  it('validates and stores the registration invite token when one is present', async () => {
    const request = {
      nextUrl: new URL('https://example.test/sign-in/start?returnTo=/dashboard&token=invite-token'),
    }

    const response = await GET(request as never)

    expect(validateRegistrationInvite).toHaveBeenCalledWith('invite-token')
    expect(createOneLoginTransaction).toHaveBeenCalledWith('/dashboard', 'invite-token')
    expect(saveOneLoginTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ registrationInviteToken: 'invite-token' }),
    )
    expect(response.headers.get('location')).toEqual('https://oidc.integration.account.gov.uk/authorize')
  })

  it('starts One Login without validating an invite for normal sign in', async () => {
    const request = {
      nextUrl: new URL('https://example.test/sign-in/start?returnTo=/dashboard'),
    }

    await GET(request as never)

    expect(validateRegistrationInvite).not.toHaveBeenCalled()
    expect(createOneLoginTransaction).toHaveBeenCalledWith('/dashboard', undefined)
    expect(buildOneLoginAuthorizeUrl).toHaveBeenCalled()
  })
})
