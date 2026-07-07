import express, { Express } from 'express'
import request from 'supertest'
import chatbotRoutes from './chatbot'
import type { Services } from '../services'
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

const minimalPersonalDetails = {
  name: { forename: 'Jane', surname: 'Doe' },
  preferredName: 'Jane',
  dateOfBirth: '1990-01-01',
}

function buildApp(opts: { user?: AuthenticatedUserSession; services?: Partial<Services> } = {}): Express {
  const app = express()
  app.use(express.json())
  app.use((req, res, next) => {
    res.locals.user = 'user' in opts ? opts.user : defaultUser
    next()
  })

  const services = {
    peopleOnProbationService: {
      getPersonalDetails: jest.fn().mockResolvedValue(minimalPersonalDetails),
      getSentences: jest.fn().mockResolvedValue({ sentences: [] }),
      getFutureAppointments: jest.fn().mockResolvedValue({ content: [] }),
      ...opts.services?.peopleOnProbationService,
    },
    ...opts.services,
  } as unknown as Services

  app.use('/api/chatbot', chatbotRoutes(services))
  return app
}

describe('POST /api/chatbot/chat', () => {
  let originalChatbotConfig: typeof config.popChatbot

  beforeEach(() => {
    originalChatbotConfig = { ...config.popChatbot }
    config.popChatbot.apiUrl = 'https://upstream.test/chat'
    config.popChatbot.apiKey = 'test-key'
  })

  afterEach(() => {
    config.popChatbot.apiUrl = originalChatbotConfig.apiUrl
    config.popChatbot.apiKey = originalChatbotConfig.apiKey
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  it('returns 401 when no authenticated user is present', async () => {
    const app = buildApp({ user: undefined })

    await request(app).post('/api/chatbot/chat').send({ message: 'hi' }).expect(401, { error: 'Not authenticated' })
  })

  it('sends an SSE error when chatbot config is missing', async () => {
    config.popChatbot.apiUrl = ''
    const app = buildApp()

    const res = await request(app).post('/api/chatbot/chat').send({ message: 'hi' }).expect(200)

    expect(res.text).toContain('"type":"error"')
    expect(res.text).toContain('"text":"Chatbot service is not configured"')
  })

  it('returns a generic error and logs details when upstream returns non-2xx', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: jest.fn().mockResolvedValue('Internal upstream stack trace here'),
    } as unknown as Response)

    const app = buildApp()

    const res = await request(app).post('/api/chatbot/chat').send({ message: 'hi' }).expect(200)

    expect(res.text).toContain('"type":"error"')
    expect(res.text).toContain('"text":"Chatbot service unavailable"')
    expect(res.text).not.toContain('Internal upstream stack trace here')
    expect(res.text).not.toContain('502')
    expect(res.text).not.toContain('Bad Gateway')

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 502,
        statusText: 'Bad Gateway',
        body: 'Internal upstream stack trace here',
      }),
      'Chatbot upstream returned a non-2xx response',
    )
  })

  it('pipes SSE frames from upstream straight through to the client', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      body: mockUpstreamStreamBody([
        'data: {"type":"chunk","text":"Hello"}\n\n',
        'data: {"type":"chunk","text":" back"}\n\n',
        'data: {"type":"done","conversation_id":"conv-1","sources":["doc-a"]}\n\n',
      ]),
    } as unknown as Response)

    const app = buildApp()

    const res = await request(app)
      .post('/api/chatbot/chat')
      .send({ message: 'hi', conversation_id: 'conv-1' })
      .expect(200)

    // Each individual chunk should appear as its own SSE frame — this is
    // what preserves token-by-token streaming end-to-end.
    expect(res.text).toContain('data: {"type":"chunk","text":"Hello"}\n\n')
    expect(res.text).toContain('data: {"type":"chunk","text":" back"}\n\n')
    expect(res.text).toContain('"type":"done"')
    expect(res.text).toContain('"conversation_id":"conv-1"')
    expect(res.text).toContain('"sources":["doc-a"]')
  })

  it('forwards a blocked frame from upstream unchanged', async () => {
    // The streaming backend now emits `blocked` frames itself when
    // guardrails hit — this proxy just forwards them, no wrapping needed.
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      body: mockUpstreamStreamBody([
        'data: {"type":"blocked","text":"I cannot help with that.","guardrail_violations":["jailbreak"]}\n\n',
        'data: {"type":"done","conversation_id":"conv-blocked"}\n\n',
      ]),
    } as unknown as Response)

    const app = buildApp()

    const res = await request(app).post('/api/chatbot/chat').send({ message: 'hi' }).expect(200)

    expect(res.text).toContain('"type":"blocked"')
    expect(res.text).toContain('"text":"I cannot help with that."')
    expect(res.text).toContain('"guardrail_violations":["jailbreak"]')
  })

  it('returns an error frame when upstream returns no response body', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      body: null,
    } as unknown as Response)

    const app = buildApp()

    const res = await request(app).post('/api/chatbot/chat').send({ message: 'hi' }).expect(200)

    expect(res.text).toContain('"type":"error"')
  })

  it('calls upstream with X-API-Key header and user_context built server-side', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      body: mockUpstreamStreamBody([
        'data: {"type":"done","conversation_id":"c-2"}\n\n',
      ]),
    } as unknown as Response)

    const app = buildApp()

    await request(app).post('/api/chatbot/chat').send({ message: 'hi' }).expect(200)

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://upstream.test/chat',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-API-Key': 'test-key',
          'Content-Type': 'application/json',
        }),
      }),
    )
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.message).toBe('hi')
    expect(body.user_context.personalDetails.name).toBe('Jane Doe')
    expect(body.user_context.metadata.crn).toBe('X123456')
  })

})

function mockUpstreamStreamBody(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const chunks = frames.map(f => encoder.encode(f))
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}
