import { AnalyticsClient } from './client'
import type { AnalyticsEvent } from './events'

function buildEvent(overrides: Partial<AnalyticsEvent> = {}): AnalyticsEvent {
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

describe('AnalyticsClient', () => {
  it('sends the event via fetch as the request body directly', () => {
    const sendFetch = jest.fn().mockResolvedValue({ ok: true })
    const client = new AnalyticsClient({ endpoint: '/analytics/events', sendFetch })

    client.send(buildEvent())

    expect(sendFetch).toHaveBeenCalledWith('/analytics/events', JSON.stringify(buildEvent()))
  })

  it('does not throw when the fetch call rejects', async () => {
    const sendFetch = jest.fn().mockRejectedValue(new Error('network down'))
    const client = new AnalyticsClient({ endpoint: '/analytics/events', sendFetch })

    expect(() => client.send(buildEvent())).not.toThrow()
    await Promise.resolve().then(() => Promise.resolve())
  })

  it('does not throw when sendFetch throws synchronously', () => {
    const sendFetch = jest.fn(() => {
      throw new Error('boom')
    })
    const client = new AnalyticsClient({ endpoint: '/analytics/events', sendFetch })

    expect(() => client.send(buildEvent())).not.toThrow()
  })

  it('uses sendBeacon when useBeacon is true and a beacon sender is configured', () => {
    const sendFetch = jest.fn()
    const sendBeacon = jest.fn().mockReturnValue(true)
    const client = new AnalyticsClient({ endpoint: '/analytics/events', sendFetch, sendBeacon })

    client.send(buildEvent(), true)

    expect(sendBeacon).toHaveBeenCalledWith('/analytics/events', JSON.stringify(buildEvent()))
    expect(sendFetch).not.toHaveBeenCalled()
  })

  it('falls back to fetch when useBeacon is true but no beacon sender is configured', () => {
    const sendFetch = jest.fn().mockResolvedValue({ ok: true })
    const client = new AnalyticsClient({ endpoint: '/analytics/events', sendFetch })

    client.send(buildEvent(), true)

    expect(sendFetch).toHaveBeenCalledWith('/analytics/events', JSON.stringify(buildEvent()))
  })

  it('falls back to fetch when the beacon sender refuses the payload (returns false)', () => {
    const sendFetch = jest.fn().mockResolvedValue({ ok: true })
    const sendBeacon = jest.fn().mockReturnValue(false)
    const client = new AnalyticsClient({ endpoint: '/analytics/events', sendFetch, sendBeacon })

    client.send(buildEvent(), true)

    expect(sendBeacon).toHaveBeenCalledWith('/analytics/events', JSON.stringify(buildEvent()))
    expect(sendFetch).toHaveBeenCalledWith('/analytics/events', JSON.stringify(buildEvent()))
  })

  it('does not use the beacon sender when useBeacon is false, even if one is configured', () => {
    const sendFetch = jest.fn().mockResolvedValue({ ok: true })
    const sendBeacon = jest.fn()
    const client = new AnalyticsClient({ endpoint: '/analytics/events', sendFetch, sendBeacon })

    client.send(buildEvent())

    expect(sendBeacon).not.toHaveBeenCalled()
    expect(sendFetch).toHaveBeenCalled()
  })

  it('does not throw when sendBeacon throws synchronously', () => {
    const sendBeacon = jest.fn(() => {
      throw new Error('boom')
    })
    const client = new AnalyticsClient({ endpoint: '/analytics/events', sendFetch: jest.fn(), sendBeacon })

    expect(() => client.send(buildEvent(), true)).not.toThrow()
  })
})
