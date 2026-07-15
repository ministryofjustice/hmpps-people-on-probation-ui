import { detectDeviceType, type AnalyticsDeviceType } from './deviceType'

export type AnalyticsEventName =
  | 'page_viewed'
  | 'page_exited'
  | 'session_started'
  | 'session_ended'
  | 'registration_succeeded'
  | 'registration_failed'
  | 'login_succeeded'
  | 'login_failed'

export type AnalyticsEvent = {
  eventId: string
  eventName: AnalyticsEventName
  occurredAt: string
  // Not set by the client — the server always attaches the real
  // authenticated session id (or a fixed fallback when unauthenticated)
  // before forwarding, since it's the only party that can resolve it (the
  // session cookie is httpOnly) and the only one that can be trusted to.
  // See server/routes/analytics.ts.
  sessionId?: string
  userId?: string
  application: string
  deviceType: AnalyticsDeviceType
  pagePath: string
  properties?: Record<string, unknown>
}

export type CreateEventContext = {
  generateId: () => string
  now: () => Date
  userAgent: string | undefined | null
  pagePath: string
  application: string
}

/**
 * Builds one fully-formed analytics event. Never includes a userId or
 * sessionId — this app has no non-sensitive stable client identifier
 * available, and the server attaches the real session id itself. Names,
 * emails, phone numbers, tokens and CRNs must never appear in `properties`
 * either; callers are responsible for only passing safe categorical values
 * (e.g. a failureReason code, a duration in seconds).
 */
export function createEvent(
  context: CreateEventContext,
  eventName: AnalyticsEventName,
  properties?: Record<string, unknown>,
): AnalyticsEvent {
  return {
    eventId: context.generateId(),
    eventName,
    occurredAt: context.now().toISOString(),
    application: context.application,
    deviceType: detectDeviceType(context.userAgent),
    pagePath: context.pagePath,
    properties,
  }
}
