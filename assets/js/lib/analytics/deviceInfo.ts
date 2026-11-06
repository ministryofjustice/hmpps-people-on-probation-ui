import { isIpadInDesktopMode } from './deviceType'

// The subset of navigator.userAgentData.getHighEntropyValues() we ask for.
// Only Chromium browsers (Chrome, Edge, Samsung Internet) implement it, so
// it's absent on Safari and Firefox.
export type ClientHints = {
  platform?: string
  platformVersion?: string
  model?: string
}

export type DeviceEnvironment = {
  userAgent: string | undefined | null
  maxTouchPoints: number
  screenWidth: number
  screenHeight: number
  pixelRatio: number
  viewportWidth: number
  viewportHeight: number
  // Chromium only (Network Information API).
  connectionType?: string
  saveData?: boolean
  clientHints?: ClientHints
}

export type NameAndVersion = {
  name: string
  version?: string
}

export type DeviceInfo = {
  os?: NameAndVersion
  browser?: NameAndVersion
  deviceModel?: string
  screenWidth: number
  screenHeight: number
  pixelRatio: number
  viewportWidth: number
  viewportHeight: number
  connectionType?: string
  saveData?: boolean
}

// Order matters: Android WebView (in-app browsers, marked "; wv)"), Edge,
// Samsung Internet and Opera all also contain "Chrome/", and WebView also
// contains "Version/".
const BROWSERS: ReadonlyArray<[string, RegExp]> = [
  ['Android WebView', /; wv\).*Chrome\/(\d+)/],
  ['Edge', /Edg(?:e|A|iOS)?\/(\d+)/],
  ['Samsung Internet', /SamsungBrowser\/(\d+)/],
  ['Opera', /(?:OPR|OPiOS)\/(\d+)/],
  ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/],
  ['Chrome', /(?:Chrome|CriOS)\/(\d+)/],
  ['Safari', /Version\/(\d+).*Safari\//],
]

function majorVersion(version: string): string | undefined {
  const major = version.split('.')[0]
  return major || undefined
}

/**
 * Client Hints report Windows as the UniversalApiContract version rather
 * than the marketing name: 13 and above is Windows 11, 1–10 is Windows 10.
 * https://learn.microsoft.com/en-us/microsoft-edge/web-platform/how-to-detect-win11
 */
function windowsVersion(platformVersion: string): string | undefined {
  const major = Number(majorVersion(platformVersion))
  if (major >= 13) return '11'
  if (major > 0) return '10'
  return undefined
}

// Client Hints names for Chromebooks, mapped to the name osFromUserAgent
// uses, so the same device is reported the same way whichever source we read.
const CLIENT_HINTS_PLATFORM_NAMES: Readonly<Record<string, string>> = {
  'Chrome OS': 'ChromeOS',
  'Chromium OS': 'ChromeOS',
}

function osFromClientHints(hints: ClientHints | undefined): NameAndVersion | undefined {
  if (!hints?.platform || !hints.platformVersion) return undefined
  if (hints.platform === 'Windows') return { name: 'Windows', version: windowsVersion(hints.platformVersion) }
  const name = CLIENT_HINTS_PLATFORM_NAMES[hints.platform] ?? hints.platform
  return { name, version: majorVersion(hints.platformVersion) }
}

/**
 * Safari 26+ always says iOS 18_6. A real iOS 18.6 device sends the same
 * token, but with Version/18.6, so it's only frozen next to Version/26 or later.
 */
function isFrozenSafariIosVersion(ua: string): boolean {
  if (!/OS 18_6 like/.test(ua)) return false
  return Number(/Version\/(\d+)/.exec(ua)?.[1]) >= 26
}

/**
 * Falls back to the user-agent string. Browsers freeze the OS version they
 * put there — macOS is always 10_15_7, Windows 11 says NT 10.0, Chrome on
 * Android always says "Android 10; K" and Safari 26+ says iOS 18_6 — so a
 * version is only returned where the user-agent still carries a real one.
 */
function osFromUserAgent(ua: string, maxTouchPoints: number): NameAndVersion | undefined {
  const iosVersion = isFrozenSafariIosVersion(ua) ? undefined : /OS (\d+)_/.exec(ua)?.[1]
  if (/iPhone|iPod/.test(ua)) return { name: 'iOS', version: iosVersion }
  if (/iPad/.test(ua)) return { name: 'iPadOS', version: iosVersion }
  if (isIpadInDesktopMode(ua, maxTouchPoints)) return { name: 'iPadOS' }

  if (/Android/.test(ua)) {
    const frozen = /Android 10; K\)/.test(ua)
    return { name: 'Android', version: frozen ? undefined : /Android (\d+)/.exec(ua)?.[1] }
  }

  if (/CrOS/.test(ua)) return { name: 'ChromeOS' }
  if (/Windows/.test(ua)) return { name: 'Windows' }
  if (/Macintosh|Mac OS X/.test(ua)) return { name: 'macOS' }
  if (/Linux/.test(ua)) return { name: 'Linux' }
  return undefined
}

// Tokens in the model's place that aren't a model: reduced Chrome's "K", and
// Firefox's "Mobile" or "Tablet".
const NOT_ANDROID_MODELS: ReadonlySet<string> = new Set(['K', 'Mobile', 'Tablet'])

/**
 * Apple doesn't expose the exact model to the web, so iOS devices only get
 * their family. Android model comes from Client Hints, or from the
 * user-agent on browsers that haven't reduced it yet (not Chrome).
 */
function detectDeviceModel(ua: string, maxTouchPoints: number, hints: ClientHints | undefined): string | undefined {
  if (hints?.model) return hints.model
  const appleFamily = /iPhone|iPad|iPod/.exec(ua)?.[0]
  if (appleFamily) return appleFamily
  if (isIpadInDesktopMode(ua, maxTouchPoints)) return 'iPad'

  // The model is followed by ")" or, in Android WebView, "; wv)".
  const androidModel = /Android [\d.]+; ([^;)]+)[;)]/.exec(ua)?.[1]?.replace(/ Build\/.*$/, '')
  return androidModel && !NOT_ANDROID_MODELS.has(androidModel) ? androidModel : undefined
}

function detectBrowser(ua: string): NameAndVersion | undefined {
  for (const [name, pattern] of BROWSERS) {
    const version = pattern.exec(ua)?.[1]
    if (version) return { name, version }
  }
  return undefined
}

/**
 * Builds the device properties attached to page_viewed events, used to
 * understand how old or low-end the devices people use are. Takes every
 * browser value as a plain argument (like detectDeviceType) so it stays a
 * pure function that can be unit tested without DOM globals.
 */
export function buildDeviceInfo(env: DeviceEnvironment): DeviceInfo {
  const ua = env.userAgent ?? ''

  return {
    os: osFromClientHints(env.clientHints) ?? osFromUserAgent(ua, env.maxTouchPoints),
    browser: detectBrowser(ua),
    deviceModel: detectDeviceModel(ua, env.maxTouchPoints, env.clientHints),
    screenWidth: env.screenWidth,
    screenHeight: env.screenHeight,
    // Browser zoom makes this values like 1.100000023841858.
    pixelRatio: Math.round(env.pixelRatio * 100) / 100,
    viewportWidth: env.viewportWidth,
    viewportHeight: env.viewportHeight,
    connectionType: env.connectionType,
    saveData: env.saveData,
  }
}
