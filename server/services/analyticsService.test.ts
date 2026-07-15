import { postAnalyticsEvent, trackServerAnalyticsEvent } from './analyticsService'
import { getPeopleOnProbationService } from './peopleOnProbationService'
import config from '../config'
import logger from '../../logger'
import type { AnalyticsEvent } from '../data/peopleOnProbationApiClient'

jest.mock('../../logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}))

jest.mock('./peopleOnProbationService', () => ({
  getPeopleOnProbationService: jest.fn(),
}))

const mockedGetPeopleOnProbationService = getPeopleOnProbationService as jest.MockedFunction<
  typeof getPeopleOnProbationService
>

function buildEvent(overrides: Partial<AnalyticsEvent> = {}): AnalyticsEvent {
  return {
    eventId: 'event-1',
    eventName: 'page_viewed',
    occurredAt: '2026-07-13T10:30:00.000Z',
    sessionId: 'session-1',
    application: 'hmpps-people-on-probation-ui',
    deviceType: 'desktop',
    pagePath: '/appointments',
    ...overrides,
  }
}

describe('postAnalyticsEvent', () => {
  let originalFeatureFlag: boolean
  let postAnalyticsEventMock: jest.Mock

  beforeEach(() => {
    originalFeatureFlag = config.features.analytics
    jest.clearAllMocks()
    postAnalyticsEventMock = jest.fn().mockResolvedValue({ eventId: 'event-1' })
    mockedGetPeopleOnProbationService.mockReturnValue({
      postAnalyticsEvent: postAnalyticsEventMock,
    } as unknown as ReturnType<typeof getPeopleOnProbationService>)
  })

  afterEach(() => {
    config.features.analytics = originalFeatureFlag
  })

  it('resolves true without calling the API client when the feature flag is off', async () => {
    config.features.analytics = false

    const result = await postAnalyticsEvent(buildEvent())

    expect(result).toBe(true)
    expect(mockedGetPeopleOnProbationService).not.toHaveBeenCalled()
  })

  it('forwards the event to the People on Probation API', async () => {
    config.features.analytics = true

    const result = await postAnalyticsEvent(buildEvent())

    expect(result).toBe(true)
    expect(postAnalyticsEventMock).toHaveBeenCalledWith(buildEvent())
  })

  it('returns false and logs a warning without throwing when the API call rejects', async () => {
    config.features.analytics = true
    postAnalyticsEventMock.mockRejectedValue(new Error('upstream error'))

    const result = await postAnalyticsEvent(buildEvent())

    expect(result).toBe(false)
    expect(logger.warn).toHaveBeenCalled()
  })

  it('treats a 409 (duplicate eventId) as success, not a failure', async () => {
    config.features.analytics = true
    postAnalyticsEventMock.mockRejectedValue({ responseStatus: 409 })

    const result = await postAnalyticsEvent(buildEvent())

    expect(result).toBe(true)
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.debug).toHaveBeenCalled()
  })
})

describe('trackServerAnalyticsEvent', () => {
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

  it('sends a fire-and-forget event with a generated session id when none is provided', async () => {
    trackServerAnalyticsEvent({ eventName: 'registration_failed', pagePath: '/sign-in/start' })
    await new Promise(process.nextTick)

    expect(postAnalyticsEventMock).toHaveBeenCalled()
    const [event] = postAnalyticsEventMock.mock.calls[0]
    expect(event).toMatchObject({
      eventName: 'registration_failed',
      pagePath: '/sign-in/start',
      deviceType: 'unknown',
    })
    expect(typeof event.sessionId).toBe('string')
    expect(event.sessionId.length).toBeGreaterThan(0)
  })

  it('uses the provided sessionId when given', async () => {
    trackServerAnalyticsEvent({
      eventName: 'login_succeeded',
      sessionId: 'transaction-123',
      pagePath: '/sign-in/callback',
    })
    await new Promise(process.nextTick)

    const [event] = postAnalyticsEventMock.mock.calls[0]
    expect(event.sessionId).toBe('transaction-123')
  })

  it('does not throw even when the API client rejects', () => {
    postAnalyticsEventMock.mockRejectedValue(new Error('upstream error'))

    expect(() =>
      trackServerAnalyticsEvent({ eventName: 'login_succeeded', sessionId: 'txn-1', pagePath: '/sign-in/callback' }),
    ).not.toThrow()
  })

  it('includes userId on the event when the caller provides one', async () => {
    trackServerAnalyticsEvent({
      eventName: 'registration_succeeded',
      sessionId: 'txn-1',
      pagePath: '/sign-in/callback',
      userId: 'registered-user-id-1',
    })
    await new Promise(process.nextTick)

    const [event] = postAnalyticsEventMock.mock.calls[0]
    expect(event.userId).toBe('registered-user-id-1')
  })

  it('omits userId when the caller does not provide one', async () => {
    trackServerAnalyticsEvent({ eventName: 'login_succeeded', sessionId: 'txn-1', pagePath: '/sign-in/callback' })
    await new Promise(process.nextTick)

    const [event] = postAnalyticsEventMock.mock.calls[0]
    expect(event.userId).toBeUndefined()
  })
})
