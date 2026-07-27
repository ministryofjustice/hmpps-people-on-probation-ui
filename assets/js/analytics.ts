import { AnalyticsClient } from './lib/analytics/client'
import { createEvent, type CreateEventContext } from './lib/analytics/events'
import { resolveInteractionElementId, isDetailsToggleClick } from './lib/analytics/interactions'
import { computeScrollDepthPercent } from './lib/analytics/scrollDepth'

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
    // document.referrer is fixed for the lifetime of the document, so
    // reusing it on the pageshow/bfcache-restore re-fire below is correct —
    // it's still the page the user originally navigated from.
    referrer: window.document.referrer,
    origin: window.location.origin,
  })

  // This app has no client-side router — every route/page change is a
  // full page load, so one page_viewed per script execution is exactly
  // "on route/page change" for a traditional multi-page app. Sent
  // immediately, once, best-effort (see client.ts) — no queue, so there's
  // nothing here that can be sent twice.
  client.send(createEvent(eventContext(), 'page_viewed'))

  let pageLoadedAt = Date.now()
  let pageExitTracked = false

  const currentScrollDepthPercent = () =>
    computeScrollDepthPercent({
      scrollTop: window.scrollY,
      viewportHeight: window.innerHeight,
      documentHeight: document.documentElement.scrollHeight,
    })

  // Tracks the deepest point reached during the view, not just the depth at
  // exit — a user who scrolls to the bottom then scrolls back up before
  // leaving still "read the whole page." Seeded from the initial viewport
  // (not 0) so a page the user never scrolls, because it already fits
  // entirely on screen, correctly reads as fully seen rather than
  // "unengaged."
  let maxScrollDepthPercent = currentScrollDepthPercent()
  let scrollUpdateQueued = false
  window.addEventListener(
    'scroll',
    () => {
      // rAF-coalesced: scroll can fire dozens of times per second, and only
      // the latest position by the next paint matters for a running max.
      if (scrollUpdateQueued) return
      scrollUpdateQueued = true
      window.requestAnimationFrame(() => {
        scrollUpdateQueued = false
        maxScrollDepthPercent = Math.max(maxScrollDepthPercent, currentScrollDepthPercent())
      })
    },
    { passive: true },
  )

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
    client.send(createEvent(eventContext(), 'page_exited', { durationSeconds, maxScrollDepthPercent }), true)
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') trackPageExited()
  })
  window.addEventListener('pagehide', trackPageExited)

  // A back/forward-cache restore (Safari/Firefox's back button, commonly)
  // resumes this exact script instance without re-running it — so without
  // this, a bfcache-restored visit sends no page_viewed (the top-level
  // call above never re-executes) and, since pageExitTracked is still true
  // from the exit that put the page into bfcache, no page_exited either
  // when the user leaves again. pageshow fires on every load (including
  // normal fresh ones), so persisted must be checked to only act on true
  // restores. Resetting pageLoadedAt here is what keeps the next
  // page_exited's duration scoped to the restored viewing period rather
  // than including the entire frozen-in-bfcache gap.
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return
    pageExitTracked = false
    pageLoadedAt = Date.now()
    // Same reasoning as pageLoadedAt above: scope the next page_exited's
    // scroll depth to the restored viewing period, re-seeded from wherever
    // the restored scroll position happens to be, not the pre-bfcache max.
    maxScrollDepthPercent = currentScrollDepthPercent()
    client.send(createEvent(eventContext(), 'page_viewed'))
  })

  // Delegated rather than bound per-element so newly rendered/dynamic
  // elements (e.g. appointment cards) are covered without re-wiring
  // listeners. useBeacon (true) matches page_exited above — a click can
  // trigger navigation before a normal fetch resolves. Checked against
  // Element, not HTMLElement — the chat icon's clickable area includes
  // inline <svg>/<path> markup, whose click targets are SVGElement.
  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return
    // <summary> clicks that open/close a <details> are tracked exclusively
    // via the 'toggle' listener below - counting them here too would
    // double-count a single details expansion as two interaction_clicked
    // events.
    if (isDetailsToggleClick(event.target)) return
    const elementId = resolveInteractionElementId(event.target)
    if (!elementId) return
    client.send(createEvent(eventContext(), 'interaction_clicked', { elementId }), true)
  })

  // 'toggle' doesn't bubble, but a capturing listener on an ancestor still
  // intercepts it on the way down to the target, so this still works as
  // delegation. Only the open transition counts as the tracked interaction —
  // collapsing a details element isn't "expanding" it.
  document.addEventListener(
    'toggle',
    event => {
      if (!(event.target instanceof HTMLDetailsElement) || !event.target.open) return
      const elementId = resolveInteractionElementId(event.target)
      if (!elementId) return
      client.send(createEvent(eventContext(), 'interaction_clicked', { elementId }), true)
    },
    true,
  )
} catch {
  // Analytics must never break the page it's running on.
}
