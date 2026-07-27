/**
 * Resolves a clicked/toggled element down to a stable elementId for
 * interaction_clicked events, or undefined if it isn't one we track.
 * Elements opt in via a `data-tracking-id` attribute (see the Nunjucks
 * templates that set it). The chat icon is a special case: it's rendered by
 * a third-party widget (@justiceaiunit/chatbot-widget) that exposes no
 * attribute pass-through or click callback, so it's matched by its bundled
 * `chatbot-button` class instead — a soft dependency on that library's
 * internal markup that could break on a widget upgrade.
 *
 * Takes Element rather than HTMLElement: the chat icon's clickable area
 * includes inline <svg>/<path> markup, whose click targets are SVGElement,
 * not HTMLElement — narrowing to HTMLElement would silently drop those clicks.
 */
export function resolveInteractionElementId(target: Element): string | undefined {
  const tracked = target.closest<HTMLElement>('[data-tracking-id]')
  if (tracked) return tracked.dataset.trackingId
  return target.closest('.chatbot-button') ? 'chat_icon' : undefined
}

/**
 * True when the click originated from a <summary> that's the disclosure
 * trigger of a <details> element (e.g. a tracked govukDetails). Those clicks
 * are tracked exclusively via the native 'toggle' event (see
 * assets/js/analytics.ts) — counting them here too would double-count a
 * single details expansion as two interaction_clicked events.
 */
export function isDetailsToggleClick(target: Element): boolean {
  return Boolean(target.closest('summary')?.closest('details'))
}
