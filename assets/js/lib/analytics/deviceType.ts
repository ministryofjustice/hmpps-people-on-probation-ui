export type AnalyticsDeviceType = 'desktop' | 'tablet' | 'mobile' | 'unknown'

/**
 * iPadOS Safari requests the desktop site by default and sends a Mac
 * user-agent, so the only way to tell an iPad apart from a Mac is that it
 * has a touch screen (Macs report 0 touch points).
 */
export function isIpadInDesktopMode(userAgent: string, maxTouchPoints: number | undefined): boolean {
  return /macintosh/i.test(userAgent) && (maxTouchPoints ?? 0) > 1
}

/**
 * Heuristic user-agent based device classification. Takes the UA string as
 * a plain argument rather than reading navigator.userAgent itself, so this
 * stays a pure, dependency-free function with no DOM globals — trivial to
 * unit test and safe to reuse from either the browser bundle or a Node
 * test file.
 */
export function detectDeviceType(userAgent: string | undefined | null, maxTouchPoints?: number): AnalyticsDeviceType {
  if (!userAgent) return 'unknown'
  const ua = userAgent.toLowerCase()

  // Tablet check must come before mobile: Android tablets include
  // "android" but omit "mobile", while Android phones include both.
  if (
    /ipad|tablet|playbook|silk/.test(ua) ||
    (/android/.test(ua) && !/mobile/.test(ua)) ||
    isIpadInDesktopMode(ua, maxTouchPoints)
  ) {
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
