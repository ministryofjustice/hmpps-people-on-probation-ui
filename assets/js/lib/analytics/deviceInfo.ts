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
 * Safari 26+ freezes the OS token at an iOS 18 value: 18_6 at first, 18_7
 * from later iOS 26 updates. On iPhone and iPad, Safari is part of the OS
 * and numbered with it (Safari 26 ships with iOS 26), so its Version/ gives
 * the real iOS version. A real iOS 18 device always sends Version/18, so any
 * iOS 18 token next to Version/26 or later is frozen, whichever 18_x it is.
 */
function iosVersionFromUserAgent(ua: string): string | undefined {
  const osVersion = /OS (\d+)_/.exec(ua)?.[1]
  const safariVersion = /Version\/(\d+)/.exec(ua)?.[1]
  return osVersion === '18' && Number(safariVersion) >= 26 ? safariVersion : osVersion
}

/**
 * Falls back to the user-agent string. Browsers freeze the OS version they
 * put there — macOS is always 10_15_7, Windows 11 says NT 10.0 and Chrome on
 * Android always says "Android 10; K" — so a version is only returned where
 * the user-agent still carries a real one, or, for Safari on iOS, where
 * Safari's own version stands in for it.
 */
function osFromUserAgent(ua: string, maxTouchPoints: number): NameAndVersion | undefined {
  const iosVersion = iosVersionFromUserAgent(ua)
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

  // Only what can follow a model is accepted: an optional " Build/…", an
  // optional "; wv" (Android WebView), then ")". Anything else in that place,
  // such as Firefox's "Mobile", an older browser's locale or Huawei's
  // "HarmonyOS", isn't a model and doesn't match. Reduced Chrome's "K" does.
  const androidModel = /Android [\d.]+; ([^;)]+?)(?: Build\/[^;)]*)?(?:; wv)?\)/.exec(ua)?.[1]
  return androidModel && androidModel !== 'K' ? androidModel : undefined
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
