import type { Express } from 'express'
import request from 'supertest'
import { appWithAllRoutes } from './testutils/appSetup'

let app: Express

beforeEach(() => {
  app = appWithAllRoutes({})
})

afterEach(() => {
  jest.resetAllMocks()
})

describe('GET /', () => {
  it('should render index page', () => {
    return request(app).get('/').expect('Content-Type', /html/).expect(200)
  })

  it('should link to sign in start with the registration invite token', async () => {
    const response = await request(app).get('/?token=invite-token').expect('Content-Type', /html/).expect(200)

    expect(response.text).toContain('href="/sign-in/start?token=invite-token"')
  })

  it('should link to sign in start with returnTo and registration invite token', async () => {
    const response = await request(app)
      .get('/?returnTo=/appointments&token=invite-token')
      .expect('Content-Type', /html/)
      .expect(200)

    expect(response.text).toContain('href="/sign-in/start?returnTo=%2Fappointments&amp;token=invite-token"')
  })
})
