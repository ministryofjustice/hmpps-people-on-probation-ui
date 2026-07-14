import { postAnalyticsEvents, trackServerAnalyticsEvent } from './analyticsService'
import { getPeopleOnProbationService } from './peopleOnProbationService'
import config from '../config'
import logger from '../../logger'
import type { AnalyticsEvent } from '../data/peopleOnProbationApiClient'

jest.mock('../../logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
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

describe('postAnalyticsEvents', () => {
  let originalFeatureFlag: boolean
  let postAnalyticsEventsMock: jest.Mock

  beforeEach(() => {
    originalFeatureFlag = config.features.analytics
    jest.clearAllMocks()
    postAnalyticsEventsMock = jest.fn().mockResolvedValue(undefined)
    mockedGetPeopleOnProbationService.mockReturnValue({
      postAnalyticsEvents: postAnalyticsEventsMock,
    } as unknown as ReturnType<typeof getPeopleOnProbationService>)
  })

  afterEach(() => {
    config.features.analytics = originalFeatureFlag
  })

  it('resolves true without calling the API client when the feature flag is off', async () => {
    config.features.analytics = false

    const result = await postAnalyticsEvents([buildEvent()])

    expect(result).toBe(true)
    expect(mockedGetPeopleOnProbationService).not.toHaveBeenCalled()
  })

  it('resolves true without calling the API client for an empty batch', async () => {
    config.features.analytics = true

    const result = await postAnalyticsEvents([])

    expect(result).toBe(true)
    expect(mockedGetPeopleOnProbationService).not.toHaveBeenCalled()
  })

  it('forwards the batch to the People on Probation API', async () => {
    config.features.analytics = true

    const result = await postAnalyticsEvents([buildEvent()])

    expect(result).toBe(true)
    expect(postAnalyticsEventsMock).toHaveBeenCalledWith([buildEvent()])
  })

  it('returns false and logs a warning without throwing when the API call rejects', async () => {
    config.features.analytics = true
    postAnalyticsEventsMock.mockRejectedValue(new Error('upstream error'))

    const result = await postAnalyticsEvents([buildEvent()])

    expect(result).toBe(false)
    expect(logger.warn).toHaveBeenCalled()
  })
})

describe('trackServerAnalyticsEvent', () => {
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

  it('sends a fire-and-forget event with a generated session id when none is provided', async () => {
    trackServerAnalyticsEvent({ eventName: 'registration_failure', pagePath: '/sign-in/start' })
    await new Promise(process.nextTick)

    expect(postAnalyticsEventsMock).toHaveBeenCalled()
    const [events] = postAnalyticsEventsMock.mock.calls[0]
    expect(events[0]).toMatchObject({
      eventName: 'registration_failure',
      pagePath: '/sign-in/start',
      deviceType: 'unknown',
    })
    expect(typeof events[0].sessionId).toBe('string')
    expect(events[0].sessionId.length).toBeGreaterThan(0)
  })

  it('uses the provided sessionId when given', async () => {
    trackServerAnalyticsEvent({
      eventName: 'login_success',
      sessionId: 'transaction-123',
      pagePath: '/sign-in/callback',
    })
    await new Promise(process.nextTick)

    const [events] = postAnalyticsEventsMock.mock.calls[0]
    expect(events[0].sessionId).toBe('transaction-123')
  })

  it('does not throw even when the API client rejects', () => {
    postAnalyticsEventsMock.mockRejectedValue(new Error('upstream error'))

    expect(() =>
      trackServerAnalyticsEvent({ eventName: 'login_success', sessionId: 'txn-1', pagePath: '/sign-in/callback' }),
    ).not.toThrow()
  })

  it('includes userId on the event when the caller provides one', async () => {
    trackServerAnalyticsEvent({
      eventName: 'registration_success',
      sessionId: 'txn-1',
      pagePath: '/sign-in/callback',
      userId: 'registered-user-id-1',
    })
    await new Promise(process.nextTick)

    const [events] = postAnalyticsEventsMock.mock.calls[0]
    expect(events[0].userId).toBe('registered-user-id-1')
  })

  it('omits userId when the caller does not provide one', async () => {
    trackServerAnalyticsEvent({ eventName: 'login_success', sessionId: 'txn-1', pagePath: '/sign-in/callback' })
    await new Promise(process.nextTick)

    const [events] = postAnalyticsEventsMock.mock.calls[0]
    expect(events[0].userId).toBeUndefined()
  })
})
