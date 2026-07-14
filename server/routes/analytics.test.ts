import express, { Express } from 'express'
import request from 'supertest'
import cookieParser from 'cookie-parser'
import analyticsRoutes from './analytics'
import { getPeopleOnProbationService } from '../services/peopleOnProbationService'
import { createAppSessionCookie } from './testutils/appSetup'
import config from '../config'
import logger from '../../logger'
import type { AnalyticsEvent } from '../data/peopleOnProbationApiClient'

jest.mock('../../logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}))

jest.mock('../services/peopleOnProbationService', () => ({
  getPeopleOnProbationService: jest.fn(),
}))

const mockedGetPeopleOnProbationService = getPeopleOnProbationService as jest.MockedFunction<
  typeof getPeopleOnProbationService
>

function buildApp(): Express {
  const app = express()
  app.use(cookieParser())
  app.use(express.json())
  app.use('/analytics', analyticsRoutes())
  return app
}

// The client never sends sessionId (the server always attaches it — see
// analytics.ts), so the default fixture omits it; tests that need to
// assert the "client sent one anyway, server overwrites it" case pass it
// via overrides explicitly.
function buildEvent(overrides: Partial<AnalyticsEvent> = {}): Partial<AnalyticsEvent> {
  return {
    eventId: 'event-1',
    eventName: 'page_viewed',
    occurredAt: '2026-07-13T10:30:00.000Z',
    application: 'hmpps-people-on-probation-ui',
    deviceType: 'desktop',
    pagePath: '/appointments',
    ...overrides,
  }
}

describe('POST /analytics/events', () => {
  let originalFeatureFlag: boolean
  let postAnalyticsEventsMock: jest.Mock

  beforeEach(() => {
    originalFeatureFlag = config.features.analytics
    config.features.analytics = true
    jest.clearAllMocks()
    postAnalyticsEventsMock = jest.fn().mockResolvedValue(undefined)
    mockedGetPeopleOnProbationService.mockReturnValue({
      postAnalyticsEvents: postAnalyticsEventsMock,
    } as unknown as ReturnType<typeof getPeopleOnProbationService>)
  })

  afterEach(() => {
    config.features.analytics = originalFeatureFlag
  })

  it('accepts a valid batch and forwards it upstream, with sessionId attached', async () => {
    const app = buildApp()

    await request(app)
      .post('/analytics/events')
      .send({ events: [buildEvent()] })
      .expect(202)

    expect(postAnalyticsEventsMock).toHaveBeenCalledWith([{ ...buildEvent(), sessionId: 'unauthenticated' }])
  })

  it('acks immediately without calling the API client when analytics is disabled by feature flag', async () => {
    config.features.analytics = false
    const app = buildApp()

    await request(app)
      .post('/analytics/events')
      .send({ events: [buildEvent()] })
      .expect(202)

    expect(mockedGetPeopleOnProbationService).not.toHaveBeenCalled()
  })

  it('returns 400 when events is missing', async () => {
    const app = buildApp()

    await request(app).post('/analytics/events').send({}).expect(400)
  })

  it('returns 400 when events is an empty array', async () => {
    const app = buildApp()

    await request(app).post('/analytics/events').send({ events: [] }).expect(400)
  })

  it('returns 400 when the batch exceeds the maximum size', async () => {
    const app = buildApp()
    const events = Array.from({ length: 51 }, (_, i) => buildEvent({ eventId: `event-${i}` }))

    await request(app).post('/analytics/events').send({ events }).expect(400)
  })

  it('returns 400 when an event is missing required fields', async () => {
    const app = buildApp()
    const invalidEvent = { eventName: 'page_viewed' }

    await request(app)
      .post('/analytics/events')
      .send({ events: [invalidEvent] })
      .expect(400)
  })

  it('returns 502 and logs a warning when the upstream forward fails', async () => {
    postAnalyticsEventsMock.mockRejectedValue(new Error('upstream error'))
    const app = buildApp()

    await request(app)
      .post('/analytics/events')
      .send({ events: [buildEvent()] })
      .expect(502)

    expect(logger.warn).toHaveBeenCalled()
  })

  describe('session and userId enrichment', () => {
    it('attaches the real session id and the backend registered-user id to every event when authenticated', async () => {
      const cookie = await createAppSessionCookie('X123456')
      const realSessionId = cookie.split('=')[1]
      const app = buildApp()

      await request(app)
        .post('/analytics/events')
        .set('Cookie', cookie)
        .send({ events: [buildEvent(), buildEvent({ eventId: 'event-2' })] })
        .expect(202)

      const [sentEvents] = postAnalyticsEventsMock.mock.calls[0]
      expect(sentEvents).toHaveLength(2)
      expect(sentEvents[0].sessionId).toBe(realSessionId)
      expect(sentEvents[1].sessionId).toBe(realSessionId)
      expect(sentEvents[0].userId).toBe('registered-user-id')
      expect(sentEvents[1].userId).toBe('registered-user-id')
    })

    it('attaches the "unauthenticated" sentinel sessionId (and no userId) when there is no authenticated session', async () => {
      const app = buildApp()

      await request(app)
        .post('/analytics/events')
        .send({ events: [buildEvent()] })
        .expect(202)

      const [sentEvents] = postAnalyticsEventsMock.mock.calls[0]
      expect(sentEvents[0].sessionId).toBe('unauthenticated')
      expect(sentEvents[0].userId).toBeUndefined()
    })

    it('ignores any sessionId/userId the client sent and overwrites both based on the server session', async () => {
      const cookie = await createAppSessionCookie('X123456')
      const realSessionId = cookie.split('=')[1]
      const app = buildApp()

      await request(app)
        .post('/analytics/events')
        .set('Cookie', cookie)
        .send({ events: [buildEvent({ sessionId: 'client-supplied-session', userId: 'client-supplied-id' })] })
        .expect(202)

      const [sentEvents] = postAnalyticsEventsMock.mock.calls[0]
      expect(sentEvents[0].sessionId).toBe(realSessionId)
      expect(sentEvents[0].userId).toBe('registered-user-id')
    })

    it('never forwards a client-supplied userId on an unauthenticated request', async () => {
      const app = buildApp()

      await request(app)
        .post('/analytics/events')
        .send({ events: [buildEvent({ userId: 'attacker-supplied-user-id' })] })
        .expect(202)

      const [sentEvents] = postAnalyticsEventsMock.mock.calls[0]
      expect(sentEvents[0].userId).toBeUndefined()
      expect(sentEvents[0].sessionId).toBe('unauthenticated')
    })

    it('does not forward unknown fields the client adds to an event', async () => {
      const app = buildApp()

      await request(app)
        .post('/analytics/events')
        .send({
          events: [
            {
              ...buildEvent(),
              crn: 'X123456',
              email: 'someone@example.com',
              adminOverride: true,
            },
          ],
        })
        .expect(202)

      const [sentEvents] = postAnalyticsEventsMock.mock.calls[0]
      expect(sentEvents[0]).not.toHaveProperty('crn')
      expect(sentEvents[0]).not.toHaveProperty('email')
      expect(sentEvents[0]).not.toHaveProperty('adminOverride')
      expect(sentEvents[0]).toEqual({ ...buildEvent(), sessionId: 'unauthenticated' })
    })
  })
})
