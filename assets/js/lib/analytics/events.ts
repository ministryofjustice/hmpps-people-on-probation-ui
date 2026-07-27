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
  | 'interaction_clicked'

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
  // Used only to derive referrerPath on page_viewed events (see
  // resolveReferrerPath below) — answers "where did this page view come
  // from," which lets forward-path-from-X metrics be queried straight out
  // of properties, the same way durationSeconds already is.
  referrer?: string | undefined | null
  origin?: string
}

/**
 * Resolves document.referrer down to a same-origin pathname, or undefined
 * if the referrer is missing, cross-origin (e.g. a search engine or the One
 * Login redirect) or unparseable. Cross-origin referrers are deliberately
 * dropped rather than stored: forward-path analysis only cares about
 * internal navigation, and storing arbitrary external URLs would be an
 * unbounded, unreviewed input landing in properties.
 */
function resolveReferrerPath(referrer: string | undefined | null, origin: string | undefined): string | undefined {
  if (!referrer || !origin) return undefined
  try {
    const referrerUrl = new URL(referrer)
    return referrerUrl.origin === origin ? referrerUrl.pathname : undefined
  } catch {
    return undefined
  }
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
  const referrerPath = eventName === 'page_viewed' ? resolveReferrerPath(context.referrer, context.origin) : undefined
  const mergedProperties = referrerPath ? { ...properties, referrerPath } : properties

  return {
    eventId: context.generateId(),
    eventName,
    occurredAt: context.now().toISOString(),
    application: context.application,
    deviceType: detectDeviceType(context.userAgent),
    pagePath: context.pagePath,
    properties: mergedProperties,
  }
}
