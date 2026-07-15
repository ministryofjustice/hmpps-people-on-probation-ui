import { createEvent, type CreateEventContext } from './events'

function baseContext(overrides: Partial<CreateEventContext> = {}): CreateEventContext {
  return {
    generateId: () => 'event-id-1',
    now: () => new Date('2026-07-13T10:30:00.000Z'),
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
    pagePath: '/appointments',
    application: 'hmpps-people-on-probation-ui',
    ...overrides,
  }
}

describe('createEvent', () => {
  it('builds a fully-formed event with device type derived from the user agent', () => {
    const event = createEvent(baseContext(), 'page_viewed')

    expect(event).toEqual({
      eventId: 'event-id-1',
      eventName: 'page_viewed',
      occurredAt: '2026-07-13T10:30:00.000Z',
      application: 'hmpps-people-on-probation-ui',
      deviceType: 'desktop',
      pagePath: '/appointments',
      properties: undefined,
    })
  })

  it('never includes a sessionId field — the server always attaches the real one', () => {
    const event = createEvent(baseContext(), 'page_viewed')

    expect(event).not.toHaveProperty('sessionId')
  })

  it('includes properties when provided', () => {
    const event = createEvent(baseContext(), 'page_exited', { durationSeconds: 42 })

    expect(event.properties).toEqual({ durationSeconds: 42 })
  })

  it('classifies device type from the injected user agent', () => {
    const event = createEvent(
      baseContext({
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      }),
      'page_viewed',
    )

    expect(event.deviceType).toBe('mobile')
  })

  it('never includes a userId field', () => {
    const event = createEvent(baseContext(), 'page_viewed')

    expect(event).not.toHaveProperty('userId')
  })

  it('uses a fresh eventId per call via the injected generator', () => {
    let counter = 0
    const context = baseContext({
      generateId: () => {
        counter += 1
        return `event-${counter}`
      },
    })

    const first = createEvent(context, 'page_viewed')
    const second = createEvent(context, 'page_viewed')

    expect(first.eventId).toBe('event-1')
    expect(second.eventId).toBe('event-2')
  })
})
