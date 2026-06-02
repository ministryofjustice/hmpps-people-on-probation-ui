import express from 'express'
import request from 'supertest'
import cookieParser from 'cookie-parser'
import setUpAuthentication from './setUpAuthentication'
import { getOneLoginPublicJwk } from '../auth/oneLoginKeys'
import { appSessionCookieName } from '../auth/cookies'
import { createAuthenticatedUserSession, saveAuthenticatedUserSession } from '../auth/sessionStore'

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

const mockedGetOneLoginPublicJwk = getOneLoginPublicJwk as jest.MockedFunction<typeof getOneLoginPublicJwk>

describe('setUpAuthentication', () => {
  beforeEach(() => {
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
})
