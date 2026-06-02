import express from 'express'
import request from 'supertest'
import setUpAuthentication from './setUpAuthentication'
import { getOneLoginPublicJwk } from '../auth/oneLoginKeys'

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
})
