import express, { Express } from 'express'
import request from 'supertest'
import setUpAdminAuthentication from './setUpAdminAuthentication'
import setUpWebSession from './setUpWebSession'
import endActiveAdminPreviewSession from '../auth/adminPreviewSession'
import AuditService from '../services/auditService'
import logger from '../../logger'

jest.mock('../auth/adminPreviewSession')
jest.mock('../services/auditService')

jest.mock('../../logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}))

const mockedEndActiveAdminPreviewSession = endActiveAdminPreviewSession as jest.MockedFunction<
  typeof endActiveAdminPreviewSession
>

function buildApp({ signedIn = true }: { signedIn?: boolean } = {}) {
  const app = express()
  app.use(setUpWebSession())
  app.use((req, res, next) => {
    // Simulates a signed-in admin without driving the real OAuth2 flow -
    // passport.session() (mounted inside setUpAdminAuthentication) leaves an
    // already-set req.user untouched when there's nothing to deserialize.
    if (signedIn) {
      req.user = { token: 'token', username: 'admin1', authSource: 'auth' }
      req.logout = ((cb: (err: unknown) => void) => cb(undefined)) as typeof req.logout
    }
    next()
  })

  const auditService = new AuditService() as jest.Mocked<AuditService>
  app.use('/admin', setUpAdminAuthentication({ auditService } as never))

  return app as Express
}

describe('setUpAdminAuthentication /sign-out', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('still logs the admin out and redirects to HMPPS Auth when ending the preview session fails', async () => {
    mockedEndActiveAdminPreviewSession.mockRejectedValue(new Error('session store down'))

    const response = await request(buildApp()).get('/admin/sign-out').expect(302)

    expect(mockedEndActiveAdminPreviewSession).toHaveBeenCalled()
    expect(response.headers.location).toContain('/sign-out?client_id=')
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'Failed to end active admin preview session during sign-out',
    )
  })

  it('logs the admin out and redirects to HMPPS Auth when ending the preview session succeeds', async () => {
    mockedEndActiveAdminPreviewSession.mockResolvedValue(undefined)

    const response = await request(buildApp()).get('/admin/sign-out').expect(302)

    expect(response.headers.location).toContain('/sign-out?client_id=')
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('redirects straight to HMPPS Auth sign-out without attempting to log out when there is no admin session', async () => {
    mockedEndActiveAdminPreviewSession.mockResolvedValue(undefined)

    const response = await request(buildApp({ signedIn: false }))
      .get('/admin/sign-out')
      .expect(302)

    expect(response.headers.location).toContain('/sign-out?client_id=')
  })
})
