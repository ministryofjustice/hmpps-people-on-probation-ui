import express, { Express } from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import chatbotRoutes from './chatbot'
import type { Services } from '../services'
import type { AuthenticatedUserSession } from '../auth/sessionStore'
import config from '../config'
import logger from '../../logger'
import { formatDate, formatDateWithDay, formatTimeRange } from '../utils/utils'

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

function buildApp(
  opts: {
    user?: AuthenticatedUserSession
    services?: { peopleOnProbationService?: Partial<Services['peopleOnProbationService']> }
  } = {},
): Express {
  const app = express()
  app.use(express.json())
  app.use((req, res, next) => {
    res.locals.user = 'user' in opts ? opts.user : defaultUser
    next()
  })

  const services = {
    ...opts.services,
    peopleOnProbationService: {
      getPersonalDetails: jest.fn().mockResolvedValue(minimalPersonalDetails),
      getSentences: jest.fn().mockResolvedValue({ sentences: [] }),
      getFutureAppointments: jest.fn().mockResolvedValue({ content: [] }),
      getPastAppointments: jest.fn().mockResolvedValue({ content: [] }),
      getSentencePlan: jest.fn().mockResolvedValue({ crn: 'X123456', nomis: 'N1', goals: [] }),
      ...opts.services?.peopleOnProbationService,
    },
  } as unknown as Services

  app.use('/api/chatbot', chatbotRoutes(services))
  return app
}

describe('POST /api/chatbot/chat', () => {
  let originalChatbotConfig: typeof config.popChatbot

  let originalChatbotFeatureFlag: boolean

  beforeEach(() => {
    originalChatbotConfig = { ...config.popChatbot }
    originalChatbotFeatureFlag = config.features.chatbot
    config.features.chatbot = true
    config.popChatbot.apiUrl = 'https://upstream.test/chat'
    config.popChatbot.apiKey = 'test-key'
  })

  afterEach(() => {
    config.popChatbot.apiUrl = originalChatbotConfig.apiUrl
    config.popChatbot.apiKey = originalChatbotConfig.apiKey
    config.popChatbot.userTokenSecret = originalChatbotConfig.userTokenSecret
    config.features.chatbot = originalChatbotFeatureFlag
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

  it('sends an SSE error when the chatbot feature flag is off, even if credentials are present', async () => {
    config.features.chatbot = false
    const fetchSpy = jest.spyOn(global, 'fetch')
    const app = buildApp()

    const res = await request(app).post('/api/chatbot/chat').send({ message: 'hi' }).expect(200)

    expect(res.text).toContain('"type":"error"')
    expect(res.text).toContain('"text":"Chatbot service is not configured"')
    // No upstream call should happen when the flag is off.
    expect(fetchSpy).not.toHaveBeenCalled()
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
      body: mockUpstreamStreamBody(['data: {"type":"done","conversation_id":"c-2"}\n\n']),
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
    expect(body.user_context.personalDetails.name).toEqual({ forename: 'Jane', surname: 'Doe' })
    expect(body.user_context.metadata.crn).toBe('X123456')
  })

  it('sanitizes goals and appointments to the fields actually shown on screen', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      body: mockUpstreamStreamBody(['data: {"type":"done","conversation_id":"c-goals"}\n\n']),
    } as unknown as Response)

    const app = buildApp({
      services: {
        peopleOnProbationService: {
          getPastAppointments: jest.fn().mockResolvedValue({
            content: [{ type: 'Office Visit', date: '2026-06-01' }],
          }),
          getSentencePlan: jest.fn().mockResolvedValue({
            crn: 'X123456',
            nomis: 'N1',
            planStatus: 'AGREED',
            goals: [{ goalTitle: 'Find stable housing', goalStatus: 'ACTIVE', steps: [] }],
          }),
        },
      },
    })

    await request(app).post('/api/chatbot/chat').send({ message: 'hi' }).expect(200)

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.user_context.pastAppointments).toEqual([
      { type: 'Office Visit', date: formatDateWithDay('2026-06-01'), isUnpaidWork: false, address: [] },
    ])
    expect(body.user_context.sentencePlan.goals).toEqual([
      { title: 'Find stable housing', completedSteps: 0, totalSteps: 0, steps: [] },
    ])
  })

  it('strips fields the POP UI never shows on any screen, so the chatbot cannot know more than the user can see', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      body: mockUpstreamStreamBody(['data: {"type":"done","conversation_id":"c-sanitize"}\n\n']),
    } as unknown as Response)

    const app = buildApp({
      services: {
        peopleOnProbationService: {
          getPersonalDetails: jest.fn().mockResolvedValue({
            ...minimalPersonalDetails,
            lastUpdatedAt: '2026-01-01T00:00:00Z',
            mainAddress: { street: 'Holloway Road', postcode: 'N7 8JL', lastUpdatedAt: '2026-01-01T00:00:00Z' },
            practitioner: {
              name: { forename: 'Alex', surname: 'Murphy' },
              team: {
                telephoneNumber: '020 7946 0987',
                officeAddresses: [{ street: 'Office One' }, { street: 'Office Two (hidden)' }],
              },
            },
          }),
          getSentences: jest.fn().mockResolvedValue({
            sentences: [
              {
                type: 'Community Order',
                startDate: '2025-10-01',
                expectedEndDate: '2026-09-30',
                mainOffence: { code: 'THEFT1', description: 'Theft' },
                additionalOffences: [{ code: 'X', description: 'Should never appear' }],
                lastUpdatedAt: '2026-01-01T00:00:00Z',
                requirements: [
                  {
                    mainCategory: { code: 'F', description: 'Rehabilitation Activity Requirement' },
                    required: 25,
                    completed: 8,
                    unit: 'days',
                    imposedDate: '2025-09-01',
                    expectedStartDate: '2026-06-03',
                    expectedEndDate: '2026-12-31',
                    lastUpdatedAt: '2026-01-01T00:00:00Z',
                  },
                ],
                licenceConditions: [{ mainCategory: { code: 'L1', description: 'Should never appear' } }],
              },
              { type: 'Second sentence — should never appear', requirements: [], licenceConditions: [] },
            ],
          }),
          getPastAppointments: jest.fn().mockResolvedValue({
            content: [
              {
                date: '2026-05-08',
                type: 'Office Visit',
                typeCode: 'C123',
                outcome: 'Failed to attend',
                attended: false,
                complied: false,
                lastUpdatedAt: '2026-01-01T00:00:00Z',
              },
            ],
          }),
          getSentencePlan: jest.fn().mockResolvedValue({
            crn: 'X123456',
            nomis: 'N1',
            planStatus: 'CURRENT',
            goals: [
              {
                goalTitle: 'Find stable housing',
                areaOfNeed: 'ACCOMMODATION',
                relatedAreaOfNeed: ['EMPLOYMENT'],
                goalStatus: 'ACTIVE',
                steps: [{ description: 'Register with housing office', status: 'COMPLETED', statusDate: '2026-01-01' }],
              },
            ],
          }),
        },
      },
    })

    await request(app).post('/api/chatbot/chat').send({ message: 'hi' }).expect(200)

    const { user_context: ctx } = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)

    expect(ctx.personalDetails.lastUpdatedAt).toBeUndefined()
    expect(ctx.personalDetails.mainAddress.lastUpdatedAt).toBeUndefined()
    expect(ctx.personalDetails.practitioner.team.officeAddresses).toEqual([{ street: 'Office One' }])

    expect(ctx.sentenceProgress.sentences).toHaveLength(1)
    expect(ctx.sentenceProgress.sentences[0].mainOffence).toEqual({ description: 'Theft' })
    expect(ctx.sentenceProgress.sentences[0].additionalOffences).toBeUndefined()
    expect(ctx.sentenceProgress.sentences[0].lastUpdatedAt).toBeUndefined()
    expect(ctx.sentenceProgress.sentences[0].licenceConditions).toBeUndefined()

    const rar = ctx.sentenceProgress.sentences[0].requirements[0]
    expect(rar.required).toBe(25)
    expect(rar.imposedDate).toBeUndefined()
    expect(rar.expectedStartDate).toBeUndefined()
    expect(rar.expectedEndDate).toBeUndefined()
    expect(rar.lastUpdatedAt).toBeUndefined()

    const pastAppt = ctx.pastAppointments[0]
    expect(pastAppt.typeCode).toBeUndefined()
    expect(pastAppt.complied).toBeUndefined()
    expect(pastAppt.lastUpdatedAt).toBeUndefined()
    expect(pastAppt.attended).toBe(false)

    expect(ctx.sentencePlan.crn).toBeUndefined()
    expect(ctx.sentencePlan.nomis).toBeUndefined()
    expect(ctx.sentencePlan.planStatus).toBeUndefined()
    expect(ctx.sentencePlan.goals[0].areaOfNeed).toBeUndefined()
    expect(ctx.sentencePlan.goals[0].relatedAreaOfNeed).toBeUndefined()
    expect(ctx.sentencePlan.goals[0].steps[0].statusDate).toBeUndefined()
  })

  it('drops appointments hidden from the appointments screen (matching shouldShowAppointment)', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      body: mockUpstreamStreamBody(['data: {"type":"done","conversation_id":"c-hidden"}\n\n']),
    } as unknown as Response)

    const app = buildApp({
      services: {
        peopleOnProbationService: {
          getFutureAppointments: jest.fn().mockResolvedValue({
            content: [
              { date: '2026-07-01', type: 'Community Payback', unpaidWork: { project: { code: 'N07TTA2' } } },
              { date: '2026-07-02', type: 'Office Visit' },
            ],
          }),
        },
      },
    })

    await request(app).post('/api/chatbot/chat').send({ message: 'hi' }).expect(200)

    const { user_context: ctx } = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(ctx.futureAppointments).toHaveLength(1)
    expect(ctx.futureAppointments[0].date).toBe(formatDateWithDay('2026-07-02'))
  })

  it('resolves unpaid work appointment type and hides the time/location/practitioner the appointments screen also hides for them', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      body: mockUpstreamStreamBody(['data: {"type":"done","conversation_id":"c-uw"}\n\n']),
    } as unknown as Response)

    const app = buildApp({
      services: {
        peopleOnProbationService: {
          getFutureAppointments: jest.fn().mockResolvedValue({
            content: [
              {
                date: '2026-07-01',
                startTime: '09:00',
                endTime: '15:00',
                type: 'Some internal code (NS)',
                location: { street: 'Should never appear for unpaid work' },
                practitioner: { name: { forename: 'Alex', surname: 'Murphy' } },
                unpaidWork: { pickUpLocation: { street: 'Pick up point' }, project: { code: 'ABC123' } },
              },
              { date: '2026-07-02', startTime: '10:00', endTime: '10:45', type: 'Office Visit (NS)' },
            ],
          }),
        },
      },
    })

    await request(app).post('/api/chatbot/chat').send({ message: 'hi' }).expect(200)

    const { user_context: ctx } = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    const unpaidWorkAppt = ctx.futureAppointments[0]
    expect(unpaidWorkAppt.type).toBe('Community payback (unpaid work)')
    expect(unpaidWorkAppt.timeRange).toBeUndefined()
    expect(unpaidWorkAppt.address).toEqual([])
    expect(unpaidWorkAppt.practitionerName).toBeUndefined()

    const officeVisit = ctx.futureAppointments[1]
    expect(officeVisit.type).toBe('Office Visit')
    expect(officeVisit.timeRange).toBe(formatTimeRange('10:00', '10:45'))
  })

  it('drops goals whose status is not shown on any goals tab, and derives achievedDate from steps for achieved goals', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      body: mockUpstreamStreamBody(['data: {"type":"done","conversation_id":"c-goals"}\n\n']),
    } as unknown as Response)

    const app = buildApp({
      services: {
        peopleOnProbationService: {
          getSentencePlan: jest.fn().mockResolvedValue({
            goals: [
              { goalTitle: 'Not shown on any tab', goalStatus: 'REMOVED', steps: [] },
              {
                goalTitle: 'Find stable housing',
                goalStatus: 'ACHIEVED',
                steps: [
                  { description: 'Register', status: 'COMPLETED', statusDate: '2026-01-05' },
                  { description: 'Attend appointment', status: 'COMPLETED', statusDate: '2026-01-10' },
                ],
              },
            ],
          }),
        },
      },
    })

    await request(app).post('/api/chatbot/chat').send({ message: 'hi' }).expect(200)

    const { user_context: ctx } = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(ctx.sentencePlan.goals).toHaveLength(1)
    expect(ctx.sentencePlan.goals[0].title).toBe('Find stable housing')
    expect(ctx.sentencePlan.goals[0].achievedDate).toBe(formatDate('2026-01-10'))
  })

  it('still builds user_context from the working endpoints when one upstream call rejects', async () => {
    const upstreamError = new Error('future appointments endpoint down')
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      body: mockUpstreamStreamBody(['data: {"type":"done","conversation_id":"c-3"}\n\n']),
    } as unknown as Response)

    const app = buildApp({
      services: {
        peopleOnProbationService: {
          getFutureAppointments: jest.fn().mockRejectedValue(upstreamError),
        },
      },
    })

    await request(app).post('/api/chatbot/chat').send({ message: 'hi' }).expect(200)

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    // The sources that didn't fail still contribute their share of context.
    expect(body.user_context.personalDetails.name).toEqual({ forename: 'Jane', surname: 'Doe' })
    expect(body.user_context.metadata.crn).toBe('X123456')
    // The failed source is omitted entirely rather than dropping the whole context.
    expect(body.user_context.futureAppointments).toBeUndefined()

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: upstreamError, crn: 'X123456' }),
      'futureAppointments failed; continuing without it',
    )
  })

  it('does NOT include X-POP-User-Token header when userTokenSecret is unset', async () => {
    config.popChatbot.userTokenSecret = undefined
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      body: mockUpstreamStreamBody(['data: {"type":"done"}\n\n']),
    } as unknown as Response)

    const app = buildApp()

    await request(app).post('/api/chatbot/chat').send({ message: 'hi' }).expect(200)

    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers['X-POP-User-Token']).toBeUndefined()
  })

  it('includes a valid HS256 JWT in X-POP-User-Token when userTokenSecret is set', async () => {
    config.popChatbot.userTokenSecret = 'test-shared-secret-do-not-use-in-prod'
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      body: mockUpstreamStreamBody(['data: {"type":"done"}\n\n']),
    } as unknown as Response)

    const app = buildApp()

    await request(app).post('/api/chatbot/chat').send({ message: 'hi' }).expect(200)

    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    const token = headers['X-POP-User-Token']
    expect(typeof token).toBe('string')
    expect(token).toMatch(/^eyJ/)

    // Verifies with the same secret and returns the flattened ctx.
    const decoded = jwt.verify(token, 'test-shared-secret-do-not-use-in-prod') as {
      sub: string
      exp: number
      ctx: Record<string, unknown>
    }
    expect(decoded.sub).toBe('user-1')
    expect(decoded.ctx.name).toBe('Jane Doe')
    expect(decoded.ctx.preferred_name).toBe('Jane')
    // Fields the flat schema doesn't have must not appear in ctx.
    expect(decoded.ctx).not.toHaveProperty('personalDetails')
    expect(decoded.ctx).not.toHaveProperty('metadata')
    expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('rejects a JWT that was tampered with (verify with wrong secret throws)', async () => {
    config.popChatbot.userTokenSecret = 'the-real-secret'
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      body: mockUpstreamStreamBody(['data: {"type":"done"}\n\n']),
    } as unknown as Response)

    const app = buildApp()

    await request(app).post('/api/chatbot/chat').send({ message: 'hi' }).expect(200)

    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    const token = headers['X-POP-User-Token']

    expect(() => jwt.verify(token, 'wrong-secret')).toThrow()
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

describe('POST /api/chatbot/chat (session_token forwarding)', () => {
  let originalChatbotConfig: typeof config.popChatbot
  let originalChatbotFeatureFlag: boolean

  beforeEach(() => {
    originalChatbotConfig = { ...config.popChatbot }
    originalChatbotFeatureFlag = config.features.chatbot
    config.features.chatbot = true
    config.popChatbot.apiUrl = 'https://upstream.test/chat-embed-stream'
    config.popChatbot.apiKey = 'test-key'
  })

  afterEach(() => {
    config.popChatbot.apiUrl = originalChatbotConfig.apiUrl
    config.popChatbot.apiKey = originalChatbotConfig.apiKey
    config.popChatbot.userTokenSecret = originalChatbotConfig.userTokenSecret
    config.features.chatbot = originalChatbotFeatureFlag
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  it('forwards session_token from request body into upstream body', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      body: mockUpstreamStreamBody(['data: {"type":"done"}\n\n']),
    } as unknown as Response)

    const app = buildApp()

    await request(app)
      .post('/api/chatbot/chat')
      .send({ message: 'hi', conversation_id: 'embed_abc', session_token: 'sig.payload' })
      .expect(200)

    const upstreamBody = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(upstreamBody.session_token).toBe('sig.payload')
    expect(upstreamBody.conversation_id).toBe('embed_abc')
    expect(upstreamBody.message).toBe('hi')
  })
})

describe('POST /api/chatbot/chat/feedback', () => {
  let originalChatbotConfig: typeof config.popChatbot
  let originalChatbotFeatureFlag: boolean

  beforeEach(() => {
    originalChatbotConfig = { ...config.popChatbot }
    originalChatbotFeatureFlag = config.features.chatbot
    config.features.chatbot = true
    config.popChatbot.apiUrl = 'https://upstream.test/chatbot/chat-embed-stream'
    config.popChatbot.apiKey = 'test-key'
    config.popChatbot.feedbackUrl = ''
  })

  afterEach(() => {
    config.popChatbot.apiUrl = originalChatbotConfig.apiUrl
    config.popChatbot.apiKey = originalChatbotConfig.apiKey
    config.popChatbot.feedbackUrl = originalChatbotConfig.feedbackUrl
    config.features.chatbot = originalChatbotFeatureFlag
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  it('returns 401 when no authenticated user is present', async () => {
    const app = buildApp({ user: undefined })

    await request(app)
      .post('/api/chatbot/chat/feedback')
      .send({ message_id: 'm1', feedback_type: 'thumbs_up' })
      .expect(401, { error: 'Not authenticated' })
  })

  it('returns 503 when chatbot config is missing', async () => {
    config.popChatbot.apiUrl = ''
    const app = buildApp()

    await request(app)
      .post('/api/chatbot/chat/feedback')
      .send({ message_id: 'm1', feedback_type: 'thumbs_up' })
      .expect(503)
  })

  it('returns 503 when the chatbot feature flag is off, even if credentials are present', async () => {
    config.features.chatbot = false
    const fetchSpy = jest.spyOn(global, 'fetch')
    const app = buildApp()

    await request(app)
      .post('/api/chatbot/chat/feedback')
      .send({ message_id: 'm1', feedback_type: 'thumbs_up' })
      .expect(503)

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns 503 when feedback URL cannot be derived and no override is set', async () => {
    config.popChatbot.apiUrl = 'https://upstream.test/some/unexpected/path'
    const app = buildApp()

    await request(app)
      .post('/api/chatbot/chat/feedback')
      .send({ message_id: 'm1', feedback_type: 'thumbs_up' })
      .expect(503)
  })

  it('returns 400 when required fields are missing', async () => {
    const app = buildApp()

    await request(app).post('/api/chatbot/chat/feedback').send({ feedback_type: 'thumbs_up' }).expect(400)

    await request(app).post('/api/chatbot/chat/feedback').send({ message_id: 'm1' }).expect(400)
  })

  it('forwards to the derived feedback URL with X-API-Key and the expected body', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(''),
    } as unknown as Response)

    const app = buildApp()

    await request(app)
      .post('/api/chatbot/chat/feedback')
      .send({
        message_id: 'm1',
        feedback_type: 'thumbs_up',
        feedback_value: true,
        conversation_id: 'embed_abc',
        session_token: 'sig.payload',
        _csrf: 'should-be-dropped',
      })
      .expect(200)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://upstream.test/chatbot/feedback-embed')

    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers['X-API-Key']).toBe('test-key')

    const upstreamBody = JSON.parse((init as RequestInit).body as string)
    expect(upstreamBody).toEqual({
      message_id: 'm1',
      feedback_type: 'thumbs_up',
      feedback_value: true,
      conversation_id: 'embed_abc',
      session_token: 'sig.payload',
    })
    // _csrf is intentionally dropped — never forwarded to the backend.
    // eslint-disable-next-line no-underscore-dangle
    expect(upstreamBody._csrf).toBeUndefined()
  })

  it('prefers POP_CHATBOT_FEEDBACK_URL when set over the derived URL', async () => {
    config.popChatbot.feedbackUrl = 'https://upstream.test/explicit/feedback'
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(''),
    } as unknown as Response)

    const app = buildApp()

    await request(app)
      .post('/api/chatbot/chat/feedback')
      .send({ message_id: 'm1', feedback_type: 'thumbs_up' })
      .expect(200)

    expect(fetchSpy.mock.calls[0][0]).toBe('https://upstream.test/explicit/feedback')
  })

  it('returns 502 when the upstream returns non-2xx', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 502,
      text: jest.fn().mockResolvedValue('upstream broken'),
    } as unknown as Response)

    const app = buildApp()

    await request(app)
      .post('/api/chatbot/chat/feedback')
      .send({ message_id: 'm1', feedback_type: 'thumbs_up' })
      .expect(502)
  })

  it('returns 502 when the upstream fetch throws', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'))

    const app = buildApp()

    await request(app)
      .post('/api/chatbot/chat/feedback')
      .send({ message_id: 'm1', feedback_type: 'thumbs_up' })
      .expect(502)
  })
})
