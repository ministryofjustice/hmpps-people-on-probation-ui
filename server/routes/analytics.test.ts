import express, { Express } from 'express'
import request from 'supertest'
import cookieParser from 'cookie-parser'
import analyticsRoutes from './analytics'
import { getPeopleOnProbationService } from '../services/peopleOnProbationService'
import { createAppSessionCookie } from './testutils/appSetup'
import { adminPreviewSessionCookieName } from '../auth/cookies'
import { createAuthenticatedUserSession, saveAuthenticatedUserSession } from '../auth/sessionStore'
import config from '../config'
import logger from '../../logger'
import type { AnalyticsEvent } from '../data/peopleOnProbationApiClient'

jest.mock('../../logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
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
  let postAnalyticsEventMock: jest.Mock

  beforeEach(() => {
    originalFeatureFlag = config.features.analytics
    config.features.analytics = true
    jest.clearAllMocks()
    postAnalyticsEventMock = jest.fn().mockResolvedValue({ eventId: 'event-1' })
    mockedGetPeopleOnProbationService.mockReturnValue({
      postAnalyticsEvent: postAnalyticsEventMock,
    } as unknown as ReturnType<typeof getPeopleOnProbationService>)
  })

  afterEach(() => {
    config.features.analytics = originalFeatureFlag
  })

  it('accepts a valid event and forwards it upstream, with sessionId attached', async () => {
    const app = buildApp()

    await request(app).post('/analytics/events').send(buildEvent()).expect(202)

    expect(postAnalyticsEventMock).toHaveBeenCalledWith({ ...buildEvent(), sessionId: 'unauthenticated' })
  })

  it('acks immediately without calling the API client when analytics is disabled by feature flag', async () => {
    config.features.analytics = false
    const app = buildApp()

    await request(app).post('/analytics/events').send(buildEvent()).expect(202)

    expect(mockedGetPeopleOnProbationService).not.toHaveBeenCalled()
  })

  it('returns 400 when the body is empty', async () => {
    const app = buildApp()

    await request(app).post('/analytics/events').send({}).expect(400)
  })

  it('returns 400 when the event is missing required fields', async () => {
    const app = buildApp()

    await request(app).post('/analytics/events').send({ eventName: 'page_viewed' }).expect(400)
  })

  it('accepts an interaction_clicked event with an elementId property and forwards it upstream', async () => {
    const app = buildApp()

    await request(app)
      .post('/analytics/events')
      .send(buildEvent({ eventName: 'interaction_clicked', properties: { elementId: 'add_to_calendar' } }))
      .expect(202)

    const [sentEvent] = postAnalyticsEventMock.mock.calls[0]
    expect(sentEvent.eventName).toBe('interaction_clicked')
    expect(sentEvent.properties).toEqual({ elementId: 'add_to_calendar' })
  })

  it('returns 400 when eventName is not one of the allowed values', async () => {
    const app = buildApp()

    await request(app)
      .post('/analytics/events')
      .send(buildEvent({ eventName: 'something_made_up' as AnalyticsEvent['eventName'] }))
      .expect(400)
  })

  it('returns 502 and logs a warning when the upstream forward fails', async () => {
    postAnalyticsEventMock.mockRejectedValue(new Error('upstream error'))
    const app = buildApp()

    await request(app).post('/analytics/events').send(buildEvent()).expect(502)

    expect(logger.warn).toHaveBeenCalled()
  })

  describe('session and userId enrichment', () => {
    it('attaches the real session id and the backend registered-user id when authenticated', async () => {
      const cookie = await createAppSessionCookie('X123456')
      const realSessionId = cookie.split('=')[1]
      const app = buildApp()

      await request(app).post('/analytics/events').set('Cookie', cookie).send(buildEvent()).expect(202)

      const [sentEvent] = postAnalyticsEventMock.mock.calls[0]
      expect(sentEvent.sessionId).toBe(realSessionId)
      expect(sentEvent.userId).toBe('registered-user-id')
    })

    it('attaches the "unauthenticated" sentinel sessionId (and no userId) when there is no authenticated session', async () => {
      const app = buildApp()

      await request(app).post('/analytics/events').send(buildEvent()).expect(202)

      const [sentEvent] = postAnalyticsEventMock.mock.calls[0]
      expect(sentEvent.sessionId).toBe('unauthenticated')
      expect(sentEvent.userId).toBeUndefined()
    })

    it('ignores any sessionId/userId the client sent and overwrites both based on the server session', async () => {
      const cookie = await createAppSessionCookie('X123456')
      const realSessionId = cookie.split('=')[1]
      const app = buildApp()

      await request(app)
        .post('/analytics/events')
        .set('Cookie', cookie)
        .send(buildEvent({ sessionId: 'client-supplied-session', userId: 'client-supplied-id' }))
        .expect(202)

      const [sentEvent] = postAnalyticsEventMock.mock.calls[0]
      expect(sentEvent.sessionId).toBe(realSessionId)
      expect(sentEvent.userId).toBe('registered-user-id')
    })

    it('never forwards a client-supplied userId on an unauthenticated request', async () => {
      const app = buildApp()

      await request(app)
        .post('/analytics/events')
        .send(buildEvent({ userId: 'attacker-supplied-user-id' }))
        .expect(202)

      const [sentEvent] = postAnalyticsEventMock.mock.calls[0]
      expect(sentEvent.userId).toBeUndefined()
      expect(sentEvent.sessionId).toBe('unauthenticated')
    })

    it('acks immediately without forwarding when the session is an admin preview', async () => {
      const previewSession = createAuthenticatedUserSession({
        userId: 'admin-preview:admin1',
        adminPreviewSubject: { personReference: 'X123456', startedAt: '2026-01-01T00:00:00Z' },
        previewedByAdmin: 'admin1',
      })
      await saveAuthenticatedUserSession(previewSession)
      const cookie = `${adminPreviewSessionCookieName}=${previewSession.id}`
      const app = buildApp()

      await request(app).post('/analytics/events').set('Cookie', cookie).send(buildEvent()).expect(202)

      expect(postAnalyticsEventMock).not.toHaveBeenCalled()
    })

    it('does not forward unknown fields the client adds to the event', async () => {
      const app = buildApp()

      await request(app)
        .post('/analytics/events')
        .send({
          ...buildEvent(),
          crn: 'X123456',
          email: 'someone@example.com',
          adminOverride: true,
        })
        .expect(202)

      const [sentEvent] = postAnalyticsEventMock.mock.calls[0]
      expect(sentEvent).not.toHaveProperty('crn')
      expect(sentEvent).not.toHaveProperty('email')
      expect(sentEvent).not.toHaveProperty('adminOverride')
      expect(sentEvent).toEqual({ ...buildEvent(), sessionId: 'unauthenticated' })
    })
  })
})
