import express from 'express'
import request from 'supertest'
import cookieParser from 'cookie-parser'
import setUpAuthentication from './setUpAuthentication'
import { getOneLoginPublicJwk } from '../auth/oneLoginKeys'
import { getPeopleOnProbationService } from '../services/peopleOnProbationService'
import { trackServerAnalyticsEvent } from '../services/analyticsService'
import { appSessionCookieName } from '../auth/cookies'
import {
  createAuthenticatedUserSession,
  saveAuthenticatedUserSession,
  getAuthenticatedUserSession,
} from '../auth/sessionStore'
import config from '../config'

jest.mock('../auth/oneLoginAuthorize', () => jest.fn())
jest.mock('../auth/oneLoginToken', () => ({
  authenticateOneLoginCallback: jest.fn(),
}))
jest.mock('../auth/oneLoginKeys', () => ({
  getOneLoginPublicJwk: jest.fn(),
}))
jest.mock('../services/peopleOnProbationService', () => ({
  getPeopleOnProbationService: jest.fn(),
}))
jest.mock('../services/analyticsService', () => ({
  trackServerAnalyticsEvent: jest.fn(),
}))

const mockedGetOneLoginPublicJwk = getOneLoginPublicJwk as jest.MockedFunction<typeof getOneLoginPublicJwk>
const mockedGetPeopleOnProbationService = getPeopleOnProbationService as jest.MockedFunction<
  typeof getPeopleOnProbationService
>
const mockedTrackServerAnalyticsEvent = trackServerAnalyticsEvent as jest.MockedFunction<
  typeof trackServerAnalyticsEvent
>

describe('setUpAuthentication', () => {
  const localAuth = { ...config.localAuth }

  beforeEach(() => {
    config.localAuth.enabled = localAuth.enabled
    config.localAuth.oneLoginSubject = localAuth.oneLoginSubject
    config.localAuth.email = localAuth.email
    config.localAuth.displayName = localAuth.displayName
    mockedGetOneLoginPublicJwk.mockReturnValue({
      kty: 'RSA',
      n: 'modulus',
      e: 'AQAB',
      kid: 'one-login-key-id',
      use: 'sig',
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('GET /.well-known/jwks.json', () => {
    it('returns the One Login public JWKS', async () => {
      const app = express()
      app.use(setUpAuthentication())

      await request(app)
        .get('/.well-known/jwks.json')
        .expect('Content-Type', /json/)
        .expect(200)
        .expect({
          keys: [
            {
              kty: 'RSA',
              n: 'modulus',
              e: 'AQAB',
              kid: 'one-login-key-id',
              use: 'sig',
            },
          ],
        })
    })
  })

  function buildApp() {
    const app = express()
    app.use(cookieParser())
    app.use((_req, res, next) => {
      res.render = (_view: string) => res.send('ok')
      next()
    })
    app.use(setUpAuthentication())
    return app
  }

  describe('GET /session-timeout', () => {
    it('renders the session-timeout page when there is no app session cookie', async () => {
      await request(buildApp()).get('/session-timeout').expect(200)

      expect(mockedTrackServerAnalyticsEvent).not.toHaveBeenCalled()
    })

    it('deletes the session, clears the cookie, and fires session_ended when there is a valid app session cookie', async () => {
      const session = createAuthenticatedUserSession({
        userId: 'user-id',
        email: 'user@example.com',
        registeredUserDetails: {
          id: 'registered-user-id',
          personReference: 'X123456',
          status: 'ACTIVE',
          createdAt: '2026-01-01T00:00:00Z',
        },
      })
      await saveAuthenticatedUserSession(session)

      await request(buildApp())
        .get('/session-timeout')
        .set('Cookie', `${appSessionCookieName}=${session.id}`)
        .expect(200)
        .expect('Set-Cookie', new RegExp(`${appSessionCookieName}=;`))

      expect(await getAuthenticatedUserSession(session.id)).toBeNull()
      expect(mockedTrackServerAnalyticsEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'session_ended',
          sessionId: session.id,
          userId: 'registered-user-id',
        }),
      )
    })
  })

  describe('POST /session/keep-alive', () => {
    it('returns unauthorized when there is no app session cookie', async () => {
      const app = express()
      app.use(cookieParser())
      app.use(setUpAuthentication())

      await request(app).post('/session/keep-alive').expect(401)
    })

    it('refreshes the app session when there is a valid app session cookie', async () => {
      const app = express()
      app.use(cookieParser())
      app.use(setUpAuthentication())

      const session = createAuthenticatedUserSession({
        userId: 'user-id',
        email: 'user@example.com',
      })
      await saveAuthenticatedUserSession(session)

      await request(app)
        .post('/session/keep-alive')
        .set('Cookie', `${appSessionCookieName}=${session.id}`)
        .expect(204)
        .expect('Set-Cookie', new RegExp(`${appSessionCookieName}=`))
    })
  })

  describe('GET /sign-out', () => {
    beforeEach(() => {
      // Short-circuits the redirect before it needs to reach GOV.UK One
      // Login's discovery document, keeping these tests network-free.
      config.localAuth.enabled = true
    })

    it('fires session_ended with the real session id and userId when there is a valid session', async () => {
      const session = createAuthenticatedUserSession({
        userId: 'one-login-subject',
        email: 'user@example.com',
        registeredUserDetails: {
          id: 'registered-user-id',
          personReference: 'X123456',
          status: 'ACTIVE',
          createdAt: '2026-01-01T00:00:00Z',
        },
      })
      await saveAuthenticatedUserSession(session)

      await request(buildApp())
        .get('/sign-out')
        .set('Cookie', `${appSessionCookieName}=${session.id}`)
        .expect(302)
        .expect('Location', '/')

      expect(mockedTrackServerAnalyticsEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'session_ended',
          sessionId: session.id,
          userId: 'registered-user-id',
        }),
      )
      expect(await getAuthenticatedUserSession(session.id)).toBeNull()
    })

    it('does not fire session_ended when there is no session', async () => {
      await request(buildApp()).get('/sign-out').expect(302).expect('Location', '/')

      expect(mockedTrackServerAnalyticsEvent).not.toHaveBeenCalled()
    })
  })

  describe('GET /local/sign-in', () => {
    it('redirects to sign-in error when local sign-in fails with a falsy error', async () => {
      config.localAuth.enabled = true
      config.localAuth.oneLoginSubject = 'one-login-subject'

      mockedGetPeopleOnProbationService.mockReturnValue({
        getCurrentRegisteredUser: jest.fn().mockRejectedValue(null),
      } as unknown as ReturnType<typeof getPeopleOnProbationService>)

      await request(buildApp()).get('/local/sign-in').expect(302).expect('Location', '/sign-in-error')
    })
  })
})
