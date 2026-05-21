import { GET } from './route'
import { authenticateOneLoginCallback } from '../../../../lib/server/auth/oneLoginToken'
import { deleteOneLoginTransaction, getOneLoginTransaction } from '../../../../lib/server/auth/loginTransactionStore'
import { createAuthenticatedUserSession, saveAuthenticatedUserSession } from '../../../../lib/server/auth/sessionStore'
import { getPeopleOnProbationService } from '../../../../lib/server/services/peopleOnProbationService'

jest.mock('../../../../lib/server/auth/loginTransactionStore', () => ({
  deleteOneLoginTransaction: jest.fn(),
  getOneLoginTransaction: jest.fn(),
}))

jest.mock('../../../../lib/server/auth/sessionStore', () => ({
  createAuthenticatedUserSession: jest.fn(() => ({ id: 'session-id' })),
  getAuthenticatedUserSessionTtlSeconds: jest.fn(() => 7200),
  saveAuthenticatedUserSession: jest.fn(),
}))

jest.mock('../../../../lib/server/auth/oneLoginToken', () => ({
  authenticateOneLoginCallback: jest.fn(),
}))

jest.mock('../../../../lib/server/services/peopleOnProbationService', () => ({
  getPeopleOnProbationService: jest.fn(),
}))

jest.mock('../../../../lib/server/auth/redirects', () => ({
  getApplicationRedirectUrl: jest.fn((path: string) => new URL(path, 'https://example.test')),
}))

describe('/sign-in/callback', () => {
  const completeOneLoginRegistration = jest.fn()

  function requestForCallback() {
    return {
      cookies: {
        get: jest.fn(() => ({ value: 'transaction-id' })),
      },
      nextUrl: new URL('https://example.test/sign-in/callback?code=code&state=state'),
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(getPeopleOnProbationService as jest.Mock).mockReturnValue({ completeOneLoginRegistration })
    ;(authenticateOneLoginCallback as jest.Mock).mockResolvedValue({
      userId: 'one-login-sub',
      email: 'person@example.com',
      phoneNumber: '+447700900123',
      idToken: 'id-token',
    })
  })

  it('completes registration before creating the app session when the transaction has an invite token', async () => {
    ;(getOneLoginTransaction as jest.Mock).mockResolvedValue({
      id: 'transaction-id',
      state: 'state',
      returnTo: '/dashboard',
      registrationInviteToken: 'invite-token',
    })

    await GET(requestForCallback() as never)

    expect(completeOneLoginRegistration).toHaveBeenCalledWith({
      token: 'invite-token',
      oneLoginSubject: 'one-login-sub',
      email: 'person@example.com',
      mobileNumber: '+447700900123',
    })
    expect(createAuthenticatedUserSession).toHaveBeenCalledWith(expect.objectContaining({ userId: 'one-login-sub' }))
    expect(saveAuthenticatedUserSession).toHaveBeenCalledWith({ id: 'session-id' })
  })

  it('does not complete registration for normal sign in', async () => {
    ;(getOneLoginTransaction as jest.Mock).mockResolvedValue({
      id: 'transaction-id',
      state: 'state',
      returnTo: '/dashboard',
    })

    await GET(requestForCallback() as never)

    expect(completeOneLoginRegistration).not.toHaveBeenCalled()
    expect(saveAuthenticatedUserSession).toHaveBeenCalledWith({ id: 'session-id' })
  })

  it('redirects to autherror and does not create a session if registration completion fails', async () => {
    ;(getOneLoginTransaction as jest.Mock).mockResolvedValue({
      id: 'transaction-id',
      state: 'state',
      returnTo: '/dashboard',
      registrationInviteToken: 'invite-token',
    })
    completeOneLoginRegistration.mockRejectedValue(new Error('completion failed'))

    const response = await GET(requestForCallback() as never)

    expect(deleteOneLoginTransaction).toHaveBeenCalledWith('transaction-id')
    expect(saveAuthenticatedUserSession).not.toHaveBeenCalled()
    expect(response.headers.get('location')).toEqual('https://example.test/autherror')
  })
})
