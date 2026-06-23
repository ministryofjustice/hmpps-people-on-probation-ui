import express from 'express'
import request from 'supertest'
import setUpWebSecurity from './setUpWebSecurity'
import config from '../config'

function testApp() {
  const app = express()
  app.use(setUpWebSecurity())
  app.get('/feedback', (_req, res) => res.send('feedback'))
  app.get('/other', (_req, res) => res.send('other'))
  return app
}

describe('setUpWebSecurity', () => {
  const originalFeedbackBannerEnabled = config.feedbackBanner.enabled

  afterEach(() => {
    config.feedbackBanner.enabled = originalFeedbackBannerEnabled
  })

  it('allows the embedded SmartSurvey feedback iframe when the feedback banner is disabled', async () => {
    config.feedbackBanner.enabled = false

    const response = await request(testApp()).get('/feedback').expect(200)

    expect(response.headers['content-security-policy']).toContain('frame-src https://www.smartsurvey.co.uk')
    expect(response.headers['content-security-policy']).toContain("connect-src 'self' https://www.smartsurvey.co.uk")
    expect(response.headers['content-security-policy']).not.toContain('https://embed.smartsurvey.io')
    expect(response.headers['cross-origin-embedder-policy']).toBeUndefined()
  })

  it('keeps cross-origin embedder policy on other pages when the feedback banner is disabled', async () => {
    config.feedbackBanner.enabled = false

    const response = await request(testApp()).get('/other').expect(200)

    expect(response.headers['cross-origin-embedder-policy']).toEqual('require-corp')
  })
})
