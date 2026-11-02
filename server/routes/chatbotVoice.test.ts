import express, { Express } from 'express'
import request from 'supertest'
import chatbotVoiceRoutes, { identifiedLanguage, MAX_AUDIO_BYTES, MAX_SPEECH_TEXT_LENGTH } from './chatbotVoice'
import type { AuthenticatedUserSession } from '../auth/sessionStore'
import config from '../config'
import logger from '../../logger'

jest.mock('../../logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}))

const defaultUser: AuthenticatedUserSession = {
  id: 'session-1',
  userId: 'user-1',
  registeredUserDetails: { personReference: 'X123456' } as AuthenticatedUserSession['registeredUserDetails'],
  authenticatedAt: 0,
  expiresAt: Number.MAX_SAFE_INTEGER,
}

function buildApp(opts: { user?: AuthenticatedUserSession } = {}): Express {
  const app = express()
  app.use(express.json())
  app.use((req, res, next) => {
    res.locals.user = 'user' in opts ? opts.user : defaultUser
    next()
  })
  app.use('/api/chatbot/voice', chatbotVoiceRoutes())
  return app
}

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(chunk))
      controller.close()
    },
  })
}

const SECRET_REPLY = 'Your appointment is on Tuesday with Sarah Jones.'

describe('chatbot voice routes', () => {
  let originalVoiceConfig: typeof config.popChatbotVoice
  let originalFlags: { chatbot: boolean; chatbotVoice: boolean }
  let originalChatbotConfig: typeof config.popChatbot

  beforeEach(() => {
    originalVoiceConfig = { ...config.popChatbotVoice }
    originalChatbotConfig = { ...config.popChatbot }
    originalFlags = { chatbot: config.features.chatbot, chatbotVoice: config.features.chatbotVoice }
    config.features.chatbot = true
    config.features.chatbotVoice = true
    config.popChatbot.apiUrl = 'https://upstream.test/chat'
    config.popChatbot.apiKey = 'test-key'
    config.popChatbotVoice.speechKey = 'speech-key'
    config.popChatbotVoice.speechRegion = 'uksouth'
    config.popChatbotVoice.voice = 'en-GB-RyanNeural'
    config.popChatbotVoice.voiceCy = 'cy-GB-NiaNeural'
  })

  afterEach(() => {
    Object.assign(config.popChatbotVoice, originalVoiceConfig)
    Object.assign(config.popChatbot, originalChatbotConfig)
    config.features.chatbot = originalFlags.chatbot
    config.features.chatbotVoice = originalFlags.chatbotVoice
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  describe('gating', () => {
    const breakConfig: Record<string, () => void> = {
      'the voice flag is off': () => {
        config.features.chatbotVoice = false
      },
      'the chatbot itself is off': () => {
        config.features.chatbot = false
      },
      'the speech key is missing': () => {
        config.popChatbotVoice.speechKey = undefined
      },
      'the speech region is missing': () => {
        config.popChatbotVoice.speechRegion = ''
      },
    }

    it.each(Object.keys(breakConfig))('returns 404 and never calls Azure when %s', async label => {
      breakConfig[label]()
      const fetchSpy = jest.spyOn(global, 'fetch')

      await request(buildApp()).post('/api/chatbot/voice/speak').send({ text: 'hi' }).expect(404)
      await request(buildApp())
        .post('/api/chatbot/voice/transcribe')
        .set('Content-Type', 'audio/webm')
        .send(Buffer.from('abc'))
        .expect(404)
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('returns 401 when no authenticated user is present', async () => {
      const app = buildApp({ user: undefined })
      await request(app).post('/api/chatbot/voice/speak').send({ text: 'hi' }).expect(401)
      await request(app)
        .post('/api/chatbot/voice/transcribe')
        .set('Content-Type', 'audio/webm')
        .send(Buffer.from('abc'))
        .expect(401)
    })
  })

  describe('POST /api/chatbot/voice/speak', () => {
    it('rejects empty or non-string text', async () => {
      await request(buildApp()).post('/api/chatbot/voice/speak').send({ text: '   ' }).expect(400)
      await request(buildApp()).post('/api/chatbot/voice/speak').send({ text: 42 }).expect(400)
      await request(buildApp()).post('/api/chatbot/voice/speak').send({}).expect(400)
    })

    it('rejects text over the length cap before calling Azure', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch')
      await request(buildApp())
        .post('/api/chatbot/voice/speak')
        .send({ text: 'a'.repeat(MAX_SPEECH_TEXT_LENGTH + 1) })
        .expect(413)
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('synthesises with the configured voice and streams the audio back as audio/mpeg', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        body: streamOf([Buffer.from('ID3'), Buffer.from('audio-bytes')]),
      } as unknown as Response)

      const res = await request(buildApp())
        .post('/api/chatbot/voice/speak')
        .send({ text: '**Samaritans**: 116 123 (free, 24/7)' })
        .expect(200)
        .buffer(true)
        .parse((response, cb) => {
          const chunks: Buffer[] = []
          response.on('data', chunk => chunks.push(chunk))
          response.on('end', () => cb(null, Buffer.concat(chunks)))
        })

      expect(res.headers['content-type']).toBe('audio/mpeg')
      expect(res.headers['cache-control']).toBe('no-store')
      expect((res.body as Buffer).toString()).toBe('ID3audio-bytes')

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://uksouth.tts.speech.microsoft.com/cognitiveservices/v1')
      expect(init.headers).toMatchObject({
        'Ocp-Apim-Subscription-Key': 'speech-key',
        'Content-Type': 'application/ssml+xml',
      })
      expect(init.body).toContain('<voice name="en-GB-RyanNeural">')
      expect(init.body).toContain('<say-as interpret-as="telephone">116 123</say-as>')
      expect(init.body).not.toContain('**')
      expect(init.body).toContain('24 hours a day, 7 days a week')
    })

    it('reads Welsh replies with the Welsh voice and locale', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        body: streamOf([Buffer.from('cy-audio')]),
      } as unknown as Response)

      await request(buildApp())
        .post('/api/chatbot/voice/speak')
        .send({ text: '**Samariaid**: 116 123 (am ddim, 24/7)', language: 'cy' })
        .expect(200)

      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(init.body).toContain('xml:lang="cy-GB"')
      expect(init.body).toContain('<voice name="cy-GB-NiaNeural">')
      expect(init.body).toContain('<say-as interpret-as="telephone">116 123</say-as>')
      expect(init.body).toContain('24 awr y dydd, 7 diwrnod yr wythnos')
    })

    it('rejects a language other than en or cy before calling Azure', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch')
      const res = await request(buildApp())
        .post('/api/chatbot/voice/speak')
        .send({ text: 'hi', language: 'fr' })
        .expect(400)
      expect(res.body).toEqual({ error: 'language must be en or cy' })
      await request(buildApp()).post('/api/chatbot/voice/speak').send({ text: 'hi', language: 7 }).expect(400)
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('returns a generic 502 and logs only the status when Azure fails, never the text', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        body: null,
      } as unknown as Response)

      const res = await request(buildApp()).post('/api/chatbot/voice/speak').send({ text: SECRET_REPLY }).expect(502)
      expect(res.body).toEqual({ error: 'Speech service unavailable' })
      expect(logger.warn).toHaveBeenCalledWith(
        { status: 401, statusText: 'Unauthorized' },
        'Speech synthesis upstream returned a non-2xx response',
      )
      expect(JSON.stringify((logger.warn as jest.Mock).mock.calls)).not.toContain(SECRET_REPLY)
    })

    it('returns 504 when Azure times out', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      await request(buildApp()).post('/api/chatbot/voice/speak').send({ text: 'hi' }).expect(504)
    })

    it('rate-limits a single user after 60 requests in the window', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockImplementation(
          async () => ({ ok: true, status: 200, body: streamOf([Buffer.from('x')]) }) as unknown as Response,
        )
      const app = buildApp()
      const okRuns = Array.from({ length: 60 }, () =>
        request(app).post('/api/chatbot/voice/speak').send({ text: 'hi' }).expect(200),
      )
      await Promise.all(okRuns)

      const refused = await request(app).post('/api/chatbot/voice/speak').send({ text: 'hi' }).expect(429)
      expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0)
    })
  })

  describe('POST /api/chatbot/voice/transcribe', () => {
    it('rejects non-audio bodies without calling Azure', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch')
      await request(buildApp()).post('/api/chatbot/voice/transcribe').send({ audio: 'nope' }).expect(415)
      await request(buildApp())
        .post('/api/chatbot/voice/transcribe')
        .set('Content-Type', 'audio/webm')
        .send(Buffer.alloc(0))
        .expect(415)
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('rejects recordings over the size cap with JSON, without calling Azure', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch')
      const res = await request(buildApp())
        .post('/api/chatbot/voice/transcribe')
        .set('Content-Type', 'audio/webm')
        .send(Buffer.alloc(MAX_AUDIO_BYTES + 1))
        .expect(413)
      expect(res.body).toEqual({ error: 'Audio is too large' })
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('asks fast transcription to identify English or Welsh and returns the transcript and language', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          durationMilliseconds: 2900,
          combinedPhrases: [{ text: "Who's my probation officer" }, { text: "and what's their phone number?" }],
          phrases: [
            { text: "Who's my probation officer", locale: 'en-GB', durationMilliseconds: 1400 },
            { text: "and what's their phone number?", locale: 'en-GB', durationMilliseconds: 1500 },
          ],
        }),
      } as unknown as Response)

      const res = await request(buildApp())
        .post('/api/chatbot/voice/transcribe')
        .set('Content-Type', 'audio/webm;codecs=opus')
        .send(Buffer.from('fake-opus-bytes'))
        .expect(200)

      expect(res.body).toEqual({
        text: "Who's my probation officer and what's their phone number?",
        durationMs: 2900,
        language: 'en',
      })
      expect(res.headers['cache-control']).toBe('no-store')

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(
        'https://uksouth.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2024-11-15',
      )
      expect(init.headers).toEqual({ 'Ocp-Apim-Subscription-Key': 'speech-key' })
      const form = init.body as FormData
      expect(JSON.parse(form.get('definition') as string)).toEqual({
        locales: ['en-GB', 'cy-GB'],
        profanityFilterMode: 'None',
      })
      const audio = form.get('audio') as Blob
      expect(audio.type).toBe('audio/webm')
      expect(Buffer.from(await audio.arrayBuffer()).toString()).toBe('fake-opus-bytes')
    })

    it('reports Welsh when most of the recording was identified as cy-GB', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          durationMilliseconds: 4000,
          combinedPhrases: [{ text: 'Pryd mae fy apwyntiad nesaf? Thank you.' }],
          phrases: [
            { text: 'Pryd mae fy apwyntiad nesaf?', locale: 'cy-gb', durationMilliseconds: 3000 },
            { text: 'Thank you.', locale: 'en-GB', durationMilliseconds: 1000 },
          ],
        }),
      } as unknown as Response)

      const res = await request(buildApp())
        .post('/api/chatbot/voice/transcribe')
        .set('Content-Type', 'audio/mp4')
        .send(Buffer.from('aac'))
        .expect(200)
      expect(res.body).toEqual({ text: 'Pryd mae fy apwyntiad nesaf? Thank you.', durationMs: 4000, language: 'cy' })
    })

    it('returns a generic 502 and does not log the transcript when Azure fails', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      } as unknown as Response)

      const res = await request(buildApp())
        .post('/api/chatbot/voice/transcribe')
        .set('Content-Type', 'audio/mp4')
        .send(Buffer.from('aac'))
        .expect(502)
      expect(res.body).toEqual({ error: 'Speech service unavailable' })
      expect(logger.warn).toHaveBeenCalledWith(
        { status: 429, statusText: 'Too Many Requests' },
        'Speech transcription upstream returned a non-2xx response',
      )
    })

    it('rate-limits transcription independently of synthesis', async () => {
      jest.spyOn(global, 'fetch').mockImplementation(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ combinedPhrases: [{ text: 'hi' }] }),
          }) as unknown as Response,
      )
      const app = buildApp()
      await Promise.all(
        Array.from({ length: 60 }, () =>
          request(app)
            .post('/api/chatbot/voice/transcribe')
            .set('Content-Type', 'audio/webm')
            .send(Buffer.from('x'))
            .expect(200),
        ),
      )
      await request(app)
        .post('/api/chatbot/voice/transcribe')
        .set('Content-Type', 'audio/webm')
        .send(Buffer.from('x'))
        .expect(429)
      // Synthesis has its own budget and is unaffected.
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        body: streamOf([Buffer.from('x')]),
      } as unknown as Response)
      await request(app).post('/api/chatbot/voice/speak').send({ text: 'hi' }).expect(200)
    })
  })

  describe('identifiedLanguage', () => {
    it('defaults to English when Azure tagged nothing', () => {
      expect(identifiedLanguage({})).toBe('en')
      expect(identifiedLanguage({ phrases: [] })).toBe('en')
      expect(identifiedLanguage({ phrases: [{ text: 'hm' }] })).toBe('en')
    })

    it('weighs phrases by spoken time, not by count', () => {
      expect(
        identifiedLanguage({
          phrases: [
            { locale: 'cy-GB', durationMilliseconds: 5000 },
            { locale: 'en-GB', durationMilliseconds: 400 },
            { locale: 'en-GB', durationMilliseconds: 400 },
          ],
        }),
      ).toBe('cy')
    })

    it('counts untimed phrases and breaks a tie towards English', () => {
      expect(identifiedLanguage({ phrases: [{ locale: 'cy-GB' }, { locale: 'en-GB' }] })).toBe('en')
      expect(identifiedLanguage({ phrases: [{ locale: 'cy-GB' }, { locale: 'cy-GB' }, { locale: 'en-GB' }] })).toBe(
        'cy',
      )
    })
  })
})
