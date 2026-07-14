import { AnalyticsClient, type QueueStorage } from './client'
import type { AnalyticsEvent } from './events'

function createFakeStorage(initial: Record<string, string> = {}): QueueStorage {
  const store = new Map(Object.entries(initial))
  return {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value)
    },
    removeItem: key => {
      store.delete(key)
    },
  }
}

function buildEvent(eventId: string, overrides: Partial<AnalyticsEvent> = {}): AnalyticsEvent {
  return {
    eventId,
    eventName: 'page_viewed',
    occurredAt: '2026-07-13T10:30:00.000Z',
    sessionId: 'session-1',
    application: 'hmpps-people-on-probation-ui',
    deviceType: 'desktop',
    pagePath: '/appointments',
    ...overrides,
  }
}

describe('AnalyticsClient', () => {
  it('does not send anything on enqueue alone — flush must be called explicitly', () => {
    const storage = createFakeStorage()
    const sendFetch = jest.fn()
    const client = new AnalyticsClient({ endpoint: '/analytics/events', storage, sendFetch })

    client.enqueue(buildEvent('event-1'))

    expect(sendFetch).not.toHaveBeenCalled()
    expect(JSON.parse(storage.getItem('pop-analytics-pending-events') ?? '[]')).toHaveLength(1)
  })

  it('sends an enqueued event via fetch on flush and clears it from the queue on success', async () => {
    const storage = createFakeStorage()
    const sendFetch = jest.fn().mockResolvedValue({ ok: true })
    const client = new AnalyticsClient({ endpoint: '/analytics/events', storage, sendFetch })

    client.enqueue(buildEvent('event-1'))
    client.flush(false)
    await flushMicrotasks()

    expect(sendFetch).toHaveBeenCalledWith('/analytics/events', JSON.stringify({ events: [buildEvent('event-1')] }))
    expect(storage.getItem('pop-analytics-pending-events')).toBeNull()
  })

  it('sends multiple events enqueued before a single flush as one batched request', async () => {
    const storage = createFakeStorage()
    const sendFetch = jest.fn().mockResolvedValue({ ok: true })
    const client = new AnalyticsClient({ endpoint: '/analytics/events', storage, sendFetch })

    client.enqueue(buildEvent('event-1'))
    client.enqueue(buildEvent('event-2', { eventName: 'session_started' }))
    client.flush(false)
    await flushMicrotasks()

    expect(sendFetch).toHaveBeenCalledTimes(1)
    const body = JSON.parse(sendFetch.mock.calls[0][1])
    expect(body.events).toHaveLength(2)
  })

  it('keeps a failed (non-2xx) send in the queue and persisted storage for retry', async () => {
    const storage = createFakeStorage()
    const sendFetch = jest.fn().mockResolvedValue({ ok: false })
    const client = new AnalyticsClient({ endpoint: '/analytics/events', storage, sendFetch })

    client.enqueue(buildEvent('event-1'))
    client.flush(false)
    await flushMicrotasks()

    expect(JSON.parse(storage.getItem('pop-analytics-pending-events') ?? '[]')).toHaveLength(1)
  })

  it('keeps a rejected (network error) send in the queue for retry', async () => {
    const storage = createFakeStorage()
    const sendFetch = jest.fn().mockRejectedValue(new Error('network down'))
    const client = new AnalyticsClient({ endpoint: '/analytics/events', storage, sendFetch })

    client.enqueue(buildEvent('event-1'))
    client.flush(false)
    await flushMicrotasks()

    expect(JSON.parse(storage.getItem('pop-analytics-pending-events') ?? '[]')).toHaveLength(1)
  })

  it('retries a failed batch with the exact same event id, never regenerating it', async () => {
    const storage = createFakeStorage()
    const sendFetch = jest.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true })
    const client = new AnalyticsClient({ endpoint: '/analytics/events', storage, sendFetch })

    client.enqueue(buildEvent('stable-event-id'))
    client.flush(false)
    await flushMicrotasks()

    client.flush(false)
    await flushMicrotasks()

    expect(sendFetch).toHaveBeenCalledTimes(2)
    const firstBody = JSON.parse(sendFetch.mock.calls[0][1])
    const secondBody = JSON.parse(sendFetch.mock.calls[1][1])
    expect(firstBody.events[0].eventId).toBe('stable-event-id')
    expect(secondBody.events[0].eventId).toBe('stable-event-id')
  })

  it('uses sendBeacon when useBeacon is true and a beacon sender is configured', () => {
    const storage = createFakeStorage()
    const sendFetch = jest.fn()
    const sendBeacon = jest.fn().mockReturnValue(true)
    const client = new AnalyticsClient({ endpoint: '/analytics/events', storage, sendFetch, sendBeacon })

    client.enqueue(buildEvent('event-1'))
    client.flush(true)

    expect(sendBeacon).toHaveBeenCalledWith('/analytics/events', JSON.stringify({ events: [buildEvent('event-1')] }))
    expect(sendFetch).not.toHaveBeenCalled()
    expect(storage.getItem('pop-analytics-pending-events')).toBeNull()
  })

  it('keeps events queued when sendBeacon rejects the payload', () => {
    const storage = createFakeStorage()
    const sendBeacon = jest.fn().mockReturnValue(false)
    const client = new AnalyticsClient({ endpoint: '/analytics/events', storage, sendFetch: jest.fn(), sendBeacon })

    client.enqueue(buildEvent('event-1'))
    client.flush(true)

    expect(JSON.parse(storage.getItem('pop-analytics-pending-events') ?? '[]')).toHaveLength(1)
  })

  it('falls back to fetch when useBeacon is true but no beacon sender is configured', async () => {
    const storage = createFakeStorage()
    const sendFetch = jest.fn().mockResolvedValue({ ok: true })
    const client = new AnalyticsClient({ endpoint: '/analytics/events', storage, sendFetch })

    client.enqueue(buildEvent('event-1'))
    client.flush(true)
    await flushMicrotasks()

    expect(sendFetch).toHaveBeenCalled()
  })

  it('loads a previously persisted queue on construction so it can be retried', async () => {
    const persisted = JSON.stringify([buildEvent('leftover-event')])
    const storage = createFakeStorage({ 'pop-analytics-pending-events': persisted })
    const sendFetch = jest.fn().mockResolvedValue({ ok: true })
    const client = new AnalyticsClient({ endpoint: '/analytics/events', storage, sendFetch })

    client.flush(false)
    await flushMicrotasks()

    expect(sendFetch).toHaveBeenCalledWith(
      '/analytics/events',
      JSON.stringify({ events: [buildEvent('leftover-event')] }),
    )
  })

  it('combines a persisted leftover event with a newly enqueued one in a single flush', async () => {
    const persisted = JSON.stringify([buildEvent('leftover-event')])
    const storage = createFakeStorage({ 'pop-analytics-pending-events': persisted })
    const sendFetch = jest.fn().mockResolvedValue({ ok: true })
    const client = new AnalyticsClient({ endpoint: '/analytics/events', storage, sendFetch })

    client.enqueue(buildEvent('new-event'))
    client.flush(false)
    await flushMicrotasks()

    expect(sendFetch).toHaveBeenCalledTimes(1)
    const body = JSON.parse(sendFetch.mock.calls[0][1])
    expect(body.events.map((event: AnalyticsEvent) => event.eventId).sort()).toEqual(['leftover-event', 'new-event'])
  })

  it('only sends up to maxBatchSize events per flush, leaving the remainder queued', async () => {
    const storage = createFakeStorage()
    const sendFetch = jest.fn().mockResolvedValue({ ok: true })
    const client = new AnalyticsClient({ endpoint: '/analytics/events', storage, sendFetch, maxBatchSize: 1 })

    client.enqueue(buildEvent('event-1'))
    client.enqueue(buildEvent('event-2'))
    client.flush(false)
    await flushMicrotasks()

    expect(JSON.parse(storage.getItem('pop-analytics-pending-events') ?? '[]')).toHaveLength(1)
  })

  it('does not throw when storage.setItem throws', () => {
    const storage: QueueStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded')
      },
      removeItem: () => {
        throw new Error('quota exceeded')
      },
    }
    const client = new AnalyticsClient({
      endpoint: '/analytics/events',
      storage,
      sendFetch: jest.fn().mockResolvedValue({ ok: true }),
    })

    expect(() => client.enqueue(buildEvent('event-1'))).not.toThrow()
  })

  it('does nothing when flush is called with an empty queue', () => {
    const sendFetch = jest.fn()
    const client = new AnalyticsClient({ endpoint: '/analytics/events', storage: createFakeStorage(), sendFetch })

    client.flush(false)

    expect(sendFetch).not.toHaveBeenCalled()
  })
})

function flushMicrotasks(): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, 0)
  })
}
