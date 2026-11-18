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

  it('sends a same-origin referrer policy so analytics can capture document.referrer on internal navigation', async () => {
    const response = await request(testApp()).get('/other').expect(200)

    expect(response.headers['referrer-policy']).toEqual('same-origin')
  })

  it('allows spoken chatbot replies to play from a blob: URL', async () => {
    const response = await request(testApp()).get('/other').expect(200)

    expect(response.headers['content-security-policy']).toContain("media-src 'self' blob:")
  })

  describe('Permissions-Policy', () => {
    let originalVoice: typeof config.popChatbotVoice
    let originalChatbot: typeof config.popChatbot
    let originalFlags: { chatbot: boolean; chatbotVoice: boolean }

    beforeEach(() => {
      originalVoice = { ...config.popChatbotVoice }
      originalChatbot = { ...config.popChatbot }
      originalFlags = { chatbot: config.features.chatbot, chatbotVoice: config.features.chatbotVoice }
    })

    afterEach(() => {
      Object.assign(config.popChatbotVoice, originalVoice)
      Object.assign(config.popChatbot, originalChatbot)
      config.features.chatbot = originalFlags.chatbot
      config.features.chatbotVoice = originalFlags.chatbotVoice
    })

    it('denies the microphone outright while chatbot voice is off', async () => {
      config.features.chatbotVoice = false

      const response = await request(testApp()).get('/other').expect(200)

      expect(response.headers['permissions-policy']).toEqual('microphone=()')
    })

    it('allows the microphone for our own origin only once chatbot voice is fully configured', async () => {
      config.features.chatbot = true
      config.features.chatbotVoice = true
      config.popChatbot.apiUrl = 'https://upstream.test/chat'
      config.popChatbot.apiKey = 'key'
      config.popChatbotVoice.speechKey = 'speech-key'
      config.popChatbotVoice.speechRegion = 'uksouth'

      const response = await request(testApp()).get('/other').expect(200)

      expect(response.headers['permissions-policy']).toEqual('microphone=(self)')
    })
  })
})
