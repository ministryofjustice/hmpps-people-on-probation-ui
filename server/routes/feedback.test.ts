import type { Express } from 'express'
import request from 'supertest'
import { appWithAllRoutes, createAppSessionCookie } from './testutils/appSetup'
import { appSessionCookieName } from '../auth/cookies'

let app: Express

beforeEach(() => {
  app = appWithAllRoutes({})
})

afterEach(() => {
  jest.resetAllMocks()
})

describe('GET /feedback', () => {
  it('should render the feedback page for an authenticated user', async () => {
    app.locals.feedbackBanner = { enabled: true }

    const response = await request(app)
      .get('/feedback')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect('Content-Type', /html/)
      .expect(200)

    expect(response.text).toContain('Give feedback')
    expect(response.text).toContain('Help us improve this service by sharing your feedback.')
    expect(response.text).toContain('smartsurvey.co.uk')
    expect(response.text).toContain('class="pop-feedback-frame"')
    expect(response.text).not.toContain('height="800"')
    expect(response.text).not.toContain('Prototype')
    expect(response.text).not.toContain('This is a new service')
    expect(response.text).not.toContain('ss-popup-1822134')
    expect(response.text).not.toContain('embed.smartsurvey.io')
  })

  it('should redirect unauthenticated users to the sign-in page with returnTo', async () => {
    await request(app).get('/feedback').expect(302).expect('Location', '/?returnTo=%2Ffeedback')
  })

  it('should redirect users with an expired session to the session timeout page', async () => {
    await request(app)
      .get('/feedback')
      .set('Cookie', `${appSessionCookieName}=expired-session-id`)
      .expect(302)
      .expect('Location', '/session-timeout')
  })
})
