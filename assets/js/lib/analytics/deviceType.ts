export type AnalyticsDeviceType = 'desktop' | 'tablet' | 'mobile' | 'unknown'

/**
 * Heuristic user-agent based device classification. Takes the UA string as
 * a plain argument rather than reading navigator.userAgent itself, so this
 * stays a pure, dependency-free function with no DOM globals — trivial to
 * unit test and safe to reuse from either the browser bundle or a Node
 * test file.
 */
export function detectDeviceType(userAgent: string | undefined | null): AnalyticsDeviceType {
  if (!userAgent) return 'unknown'
  const ua = userAgent.toLowerCase()

  // Tablet check must come before mobile: Android tablets include
  // "android" but omit "mobile", while Android phones include both.
  if (/ipad|tablet|playbook|silk/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua))) {
    return 'tablet'
  }

  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini/.test(ua)) {
    return 'mobile'
  }

  if (/windows|macintosh|linux|x11|mozilla/.test(ua)) {
    return 'desktop'
  }

  return 'unknown'
}
