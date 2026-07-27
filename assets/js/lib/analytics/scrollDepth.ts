/**
 * Percentage of the document's vertical height that has been scrolled into
 * view, clamped to 0–100. A page that fits entirely within the viewport
 * (documentHeight <= viewportHeight) is treated as fully scrolled (100) —
 * there's nothing more to reveal, so it shouldn't read as "unengaged."
 */
// eslint-disable-next-line import/prefer-default-export -- named exports are this codebase's convention (see events.ts, client.ts); this module just doesn't have a second thing to export yet.
export function computeScrollDepthPercent(params: {
  scrollTop: number
  viewportHeight: number
  documentHeight: number
}): number {
  const { scrollTop, viewportHeight, documentHeight } = params
  if (documentHeight <= viewportHeight) return 100
  const percent = ((scrollTop + viewportHeight) / documentHeight) * 100
  return Math.min(100, Math.max(0, Math.round(percent)))
}
