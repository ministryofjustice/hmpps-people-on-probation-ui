import type { Express } from 'express'
import request from 'supertest'
import { appWithAllRoutes, createAppSessionCookie } from './testutils/appSetup'
import type { Services } from '../services'

// `chatbotEnabled` is computed once at import time from the feature flag and the
// backend credentials, which are unset under test, so index.test.ts only ever
// exercises the chatbot-off paths. Force it on for this file to cover the routes
// and nav that exist only when the chatbot is live.
jest.mock('../config', () => {
  const actual = jest.requireActual<typeof import('../config')>('../config')
  return { __esModule: true, ...actual, chatbotEnabled: true }
})

let app: Express
let peopleOnProbationService: {
  getFutureAppointments: jest.Mock
  getPastAppointments: jest.Mock
  getSentences: jest.Mock
  getName: jest.Mock
}

beforeEach(() => {
  peopleOnProbationService = {
    getFutureAppointments: jest.fn().mockResolvedValue({ content: [] }),
    getPastAppointments: jest.fn().mockResolvedValue({ content: [] }),
    getSentences: jest.fn().mockResolvedValue({ sentences: [] }),
    getName: jest.fn().mockResolvedValue({ forename: 'Alex' }),
  }

  app = appWithAllRoutes({
    services: {
      peopleOnProbationService,
    } as unknown as Partial<Services>,
  })
})

afterEach(() => {
  jest.resetAllMocks()
})

describe('when the chatbot is live', () => {
  it('GET / renders the account dashboard instead of redirecting to /chat', async () => {
    const response = await request(app)
      .get('/')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect('Content-Type', /html/)
      .expect(200)

    expect(response.text).toContain('Check your probation account')
    expect(peopleOnProbationService.getFutureAppointments).toHaveBeenCalledWith('X123456', 0, 50)
  })

  it('GET / shows the Chat nav item and points Home at /, not /home', async () => {
    const response = await request(app)
      .get('/')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('href="/chat"')
    expect(response.text).not.toContain('href="/home"')
  })

  it('GET /home redirects to /', async () => {
    await request(app)
      .get('/home')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(302)
      .expect('Location', '/')
  })

  it('GET /chat renders the full-screen chat page', async () => {
    const response = await request(app)
      .get('/chat')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect('Content-Type', /html/)
      .expect(200)

    expect(response.text).toContain('id="chatbot-root"')
  })
})
