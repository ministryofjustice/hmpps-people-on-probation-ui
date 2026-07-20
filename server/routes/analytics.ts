import { Router } from 'express'
import config from '../config'
import logger from '../../logger'
import { postAnalyticsEvent, type AnalyticsEvent, type AnalyticsEventName } from '../services/analyticsService'
import { getAppSessionCookie } from '../auth/cookies'
import { getAuthenticatedUserSession } from '../auth/sessionStore'

// The client never sends sessionId — the server is the only party that can
// resolve the real authenticated session (the cookie is httpOnly) or be
// trusted to, so it always attaches one below regardless of what (if
// anything) arrives on the wire.
type IncomingAnalyticsEvent = Omit<AnalyticsEvent, 'sessionId'>

const VALID_EVENT_NAMES: ReadonlySet<AnalyticsEventName> = new Set([
  'page_viewed',
  'page_exited',
  'session_started',
  'session_ended',
  'registration_succeeded',
  'registration_failed',
  'login_succeeded',
  'login_failed',
])

function isValidEventName(value: unknown): value is AnalyticsEventName {
  return typeof value === 'string' && VALID_EVENT_NAMES.has(value as AnalyticsEventName)
}

function isValidEvent(value: unknown): value is IncomingAnalyticsEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<IncomingAnalyticsEvent>
  return (
    typeof event.eventId === 'string' &&
    isValidEventName(event.eventName) &&
    typeof event.occurredAt === 'string' &&
    typeof event.application === 'string' &&
    typeof event.deviceType === 'string' &&
    typeof event.pagePath === 'string'
  )
}

/**
 * Same-origin proxy the browser posts one analytics event to at a time —
 * matches the backend's POST /v1/analytics/events contract, which takes a
 * single event object as the request body. Mounted
 * ahead of CSRF protection in app.ts (see comment there) since this is a
 * fire-and-forget telemetry sink, not a session-mutating action, and needs
 * to accept navigator.sendBeacon() requests which cannot carry a CSRF token.
 */
export default function analyticsRoutes(): Router {
  const router = Router()

  router.post('/events', async (req, res) => {
    if (!config.features.analytics) {
      // Analytics is switched off — ack immediately so the client doesn't
      // treat this as a failure and keep retrying a disabled endpoint.
      res.sendStatus(202)
      return
    }

    const event = req.body
    if (!isValidEvent(event)) {
      res.sendStatus(400)
      return
    }

    // The server always sets sessionId — the client never sends one (it
    // can't: the session cookie is httpOnly), so this isn't "enrichment
    // when authenticated," it's the only source of this field at all. Real
    // session.id when authenticated; a fixed, recognisable sentinel
    // otherwise, so unauthenticated stragglers group into one identifiable
    // bucket rather than each becoming an untraceable distinct "session".
    // registeredUserDetails.id (userId) is still only attached when
    // authenticated, since there's no meaningful fallback for it.
    // "session" here means the actual login session (start = successful
    // auth, end = explicit sign-out / timeout) — see setUpAuthentication.ts
    // for where session_started/session_ended fire using this same id.
    // Read the session directly (not loadCurrentUser) to avoid the side
    // effect of refreshing session TTL / rewriting the session cookie on
    // every analytics ping.
    const appSessionCookie = getAppSessionCookie(req)
    const session = appSessionCookie ? await getAuthenticatedUserSession(appSessionCookie) : null

    if (session?.previewedByAdmin) {
      // Admin "preview as user" sessions (server/routes/admin.ts) aren't
      // real citizen usage — never attribute analytics to the CRN being
      // previewed or the admin doing the previewing.
      res.sendStatus(202)
      return
    }

    const userId = session?.registeredUserDetails?.id

    const enrichedEvent: AnalyticsEvent = {
      eventId: event.eventId,
      eventName: event.eventName,
      occurredAt: event.occurredAt,
      application: event.application,
      deviceType: event.deviceType,
      pagePath: event.pagePath,
      properties: event.properties,
      sessionId: session?.id ?? 'unauthenticated',
      ...(userId ? { userId } : {}),
    }

    const ok = await postAnalyticsEvent(enrichedEvent)
    if (!ok) {
      logger.warn({ eventId: enrichedEvent.eventId }, 'Analytics event could not be forwarded upstream')
      res.sendStatus(502)
      return
    }

    res.sendStatus(202)
  })

  return router
}
