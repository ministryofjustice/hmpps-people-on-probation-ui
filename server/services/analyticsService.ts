import { randomUUID } from 'crypto'
import config from '../config'
import logger from '../../logger'
import { getPeopleOnProbationService } from './peopleOnProbationService'
import type { AnalyticsEvent } from '../data/peopleOnProbationApiClient'

export type { AnalyticsEvent, AnalyticsDeviceType } from '../data/peopleOnProbationApiClient'

const APPLICATION_NAME = 'hmpps-people-on-probation-ui'

/**
 * Forwards a batch of already-built analytics events to the People on
 * Probation API (same backend/auth as every other call in this app — see
 * PeopleOnProbationApiClient.postAnalyticsEvents). Never throws — analytics
 * must never block or break a user journey, so every failure (feature
 * disabled, network error, non-2xx response) is caught and logged, and the
 * promise always resolves.
 */
export async function postAnalyticsEvents(events: AnalyticsEvent[]): Promise<boolean> {
  if (!events.length) return true

  if (!config.features.analytics) {
    return true
  }

  try {
    await getPeopleOnProbationService().postAnalyticsEvents(events)
    return true
  } catch (err) {
    logger.warn({ err }, 'Failed to send analytics event batch')
    return false
  }
}

/**
 * Builds and fire-and-forgets a single server-originated analytics event
 * (e.g. registration/login success or failure). Used for events the server
 * is the sole authority on, so they aren't missed if the client-side page
 * that would otherwise report them is skipped (e.g. a redirect straight
 * past /welcome) or never loads (e.g. an auth failure before any session
 * exists). Deliberately synchronous/non-blocking: callers should not await
 * this, matching the "never block a user journey" requirement.
 */
export function trackServerAnalyticsEvent(params: {
  eventName: string
  sessionId?: string
  pagePath: string
  properties?: Record<string, unknown>
  userId?: string
}): void {
  const event: AnalyticsEvent = {
    eventId: randomUUID(),
    eventName: params.eventName,
    occurredAt: new Date().toISOString(),
    // Falls back to a throwaway id when no meaningful session/transaction
    // id is available yet (e.g. before a One Login transaction exists) —
    // sessionId is required by the schema and we'd rather send an
    // unlinkable event than silently drop it.
    sessionId: params.sessionId ?? randomUUID(),
    userId: params.userId,
    application: APPLICATION_NAME,
    // Server-originated events don't have access to the browser's device
    // characteristics; the client-side instrumentation covers deviceType
    // breakdowns for page_viewed/page_exited/session_started instead.
    deviceType: 'unknown',
    pagePath: params.pagePath,
    properties: params.properties,
  }

  postAnalyticsEvents([event]).catch(err => logger.warn({ err }, 'Failed to track server analytics event'))
}
