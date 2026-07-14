import { AnalyticsClient } from './lib/analytics/client'
import { createEvent, type CreateEventContext } from './lib/analytics/events'

const APPLICATION = 'hmpps-people-on-probation-ui'
const ENDPOINT = '/analytics/events'

function generateId(): string {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  // Fallback for older browsers without crypto.randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const random = Math.floor(Math.random() * 16)
    const value = char === 'x' ? random : (random % 4) + 8
    return value.toString(16)
  })
}

try {
  const client = new AnalyticsClient({
    endpoint: ENDPOINT,
    sendBeacon: window.navigator.sendBeacon
      ? (url, body) => window.navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
      : undefined,
    sendFetch: (url, body) =>
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).then(response => ({ ok: response.ok })),
  })

  const eventContext = (): CreateEventContext => ({
    generateId,
    now: () => new Date(),
    userAgent: window.navigator.userAgent,
    pagePath: window.location.pathname,
    application: APPLICATION,
  })

  // This app has no client-side router — every route/page change is a
  // full page load, so one page_viewed per script execution is exactly
  // "on route/page change" for a traditional multi-page app. Sent
  // immediately, once, best-effort (see client.ts) — no queue, so there's
  // nothing here that can be sent twice.
  client.send(createEvent(eventContext(), 'page_viewed'))

  const pageLoadedAt = Date.now()
  let pageExitTracked = false

  // visibilitychange (→ hidden) is the primary signal: on mobile the OS can
  // freeze/kill a backgrounded tab without ever firing pagehide/unload, so
  // this is the only reliable "last chance to send analytics" point there.
  // pagehide is kept as a fallback for the desktop navigation/close case
  // and for older browsers with patchy Page Visibility support. The guard
  // flag ensures we only track one exit per page view even though
  // visibilitychange can fire repeatedly (e.g. switching tabs back and forth).
  const trackPageExited = () => {
    if (pageExitTracked) return
    pageExitTracked = true
    const durationSeconds = Math.round((Date.now() - pageLoadedAt) / 1000)
    client.send(createEvent(eventContext(), 'page_exited', { durationSeconds }), true)
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') trackPageExited()
  })
  window.addEventListener('pagehide', trackPageExited)
} catch {
  // Analytics must never break the page it's running on.
}
