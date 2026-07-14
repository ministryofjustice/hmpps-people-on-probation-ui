import { Router } from 'express'
import config from '../config'
import logger from '../../logger'
import { postAnalyticsEvents, type AnalyticsEvent } from '../services/analyticsService'
import { getAppSessionCookie } from '../auth/cookies'
import { getAuthenticatedUserSession } from '../auth/sessionStore'

const MAX_EVENTS_PER_BATCH = 50

// The client never sends sessionId — the server is the only party that can
// resolve the real authenticated session (the cookie is httpOnly) or be
// trusted to, so it always attaches one below regardless of what (if
// anything) arrives on the wire.
type IncomingAnalyticsEvent = Omit<AnalyticsEvent, 'sessionId'>

function isValidEvent(value: unknown): value is IncomingAnalyticsEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<IncomingAnalyticsEvent>
  return (
    typeof event.eventId === 'string' &&
    typeof event.eventName === 'string' &&
    typeof event.occurredAt === 'string' &&
    typeof event.application === 'string' &&
    typeof event.deviceType === 'string' &&
    typeof event.pagePath === 'string'
  )
}

/**
 * Same-origin proxy the browser posts batched analytics events to. Mounted
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

    const events = req.body?.events
    if (!Array.isArray(events) || events.length === 0 || events.length > MAX_EVENTS_PER_BATCH) {
      res.sendStatus(400)
      return
    }

    if (!events.every(isValidEvent)) {
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
    const userId = session?.registeredUserDetails?.id
    const enrichedEvents: AnalyticsEvent[] = events.map(event => ({
      ...event,
      sessionId: session?.id ?? 'unauthenticated',
      ...(userId ? { userId } : {}),
    }))

    const ok = await postAnalyticsEvents(enrichedEvents)
    if (!ok) {
      logger.warn({ batchSize: events.length }, 'Analytics event batch could not be forwarded upstream')
      res.sendStatus(502)
      return
    }

    res.sendStatus(202)
  })

  return router
}
