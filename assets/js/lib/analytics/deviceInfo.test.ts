import { buildDeviceInfo, type DeviceEnvironment } from './deviceInfo'

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
// Safari 26+ freezes the OS token at 18_6; Version/ still carries the real release.
const IPHONE_SAFARI_26_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
const IPAD_SAFARI_26_UA =
  'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
const IPHONE_IOS_18_6_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'
const MAC_SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15'
const ANDROID_CHROME_REDUCED_UA =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
const ANDROID_SAMSUNG_UA =
  'Mozilla/5.0 (Linux; Android 13; SM-A146B Build/TP1A.220624.014) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36'
const ANDROID_WEBVIEW_UA =
  'Mozilla/5.0 (Linux; Android 9; SM-G960F Build/PPR1.180610.011; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36'
const ANDROID_FIREFOX_UA = 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0'
const ANDROID_FIREFOX_TABLET_UA = 'Mozilla/5.0 (Android 14; Tablet; rv:131.0) Gecko/131.0 Firefox/131.0'
const WINDOWS_EDGE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0'
const CHROMEBOOK_UA =
  'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

function env(overrides: Partial<DeviceEnvironment> = {}): DeviceEnvironment {
  return {
    userAgent: IPHONE_UA,
    maxTouchPoints: 5,
    screenWidth: 390,
    screenHeight: 844,
    pixelRatio: 3,
    viewportWidth: 390,
    viewportHeight: 664,
    ...overrides,
  }
}

describe('buildDeviceInfo', () => {
  it('builds the full set of device properties for an iPhone', () => {
    expect(buildDeviceInfo(env())).toEqual({
      os: { name: 'iOS', version: '17' },
      browser: { name: 'Safari', version: '17' },
      deviceModel: 'iPhone',
      screenWidth: 390,
      screenHeight: 844,
      pixelRatio: 3,
      viewportWidth: 390,
      viewportHeight: 664,
      connectionType: undefined,
      saveData: undefined,
    })
  })

  it('reads an iPad user agent as iPadOS', () => {
    expect(buildDeviceInfo(env({ userAgent: IPAD_UA }))).toMatchObject({
      os: { name: 'iPadOS', version: '16' },
      deviceModel: 'iPad',
    })
  })

  it.each([
    ['iPhone', IPHONE_SAFARI_26_UA, 'iOS'],
    ['iPad', IPAD_SAFARI_26_UA, 'iPadOS'],
  ])('omits the frozen 18_6 OS version from Safari 26+ on an %s', (deviceModel, userAgent, os) => {
    expect(buildDeviceInfo(env({ userAgent }))).toMatchObject({
      os: { name: os, version: undefined },
      browser: { name: 'Safari', version: '26' },
      deviceModel,
    })
  })

  it('keeps the version for a real iOS 18.6 device, which sends a matching Version/18.6', () => {
    expect(buildDeviceInfo(env({ userAgent: IPHONE_IOS_18_6_UA })).os).toEqual({ name: 'iOS', version: '18' })
  })

  it('reads a Mac user agent with a touch screen as an iPad, without the frozen Mac version', () => {
    const info = buildDeviceInfo(env({ userAgent: MAC_SAFARI_UA, maxTouchPoints: 5 }))

    expect(info).toMatchObject({
      os: { name: 'iPadOS' },
      deviceModel: 'iPad',
      browser: { name: 'Safari', version: '18' },
    })
    expect(info.os?.version).toBeUndefined()
  })

  it('reads a Mac without a touch screen as macOS with no version, since the user agent freezes it', () => {
    const info = buildDeviceInfo(env({ userAgent: MAC_SAFARI_UA, maxTouchPoints: 0 }))

    expect(info.os).toEqual({ name: 'macOS' })
    expect(info.deviceModel).toBeUndefined()
  })

  it('takes the Android model and version from Client Hints when available', () => {
    const info = buildDeviceInfo(
      env({
        userAgent: ANDROID_CHROME_REDUCED_UA,
        clientHints: { platform: 'Android', platformVersion: '14.0.0', model: 'Pixel 7a' },
      }),
    )

    expect(info).toMatchObject({
      os: { name: 'Android', version: '14' },
      browser: { name: 'Chrome', version: '130' },
      deviceModel: 'Pixel 7a',
    })
  })

  it('does not record the frozen version or placeholder model from a reduced Chrome user agent', () => {
    const info = buildDeviceInfo(env({ userAgent: ANDROID_CHROME_REDUCED_UA }))

    expect(info.os).toEqual({ name: 'Android' })
    expect(info.deviceModel).toBeUndefined()
  })

  it('takes the model from a user agent that still carries it, dropping the build number', () => {
    expect(buildDeviceInfo(env({ userAgent: ANDROID_SAMSUNG_UA }))).toMatchObject({
      os: { name: 'Android', version: '13' },
      browser: { name: 'Samsung Internet', version: '25' },
      deviceModel: 'SM-A146B',
    })
  })

  it('reads an Android WebView (in-app browser) user agent, taking the model where "; wv)" follows it', () => {
    expect(buildDeviceInfo(env({ userAgent: ANDROID_WEBVIEW_UA }))).toMatchObject({
      os: { name: 'Android', version: '9' },
      browser: { name: 'Android WebView', version: '130' },
      deviceModel: 'SM-G960F',
    })
  })

  it('reads Firefox on Android, which never includes a model', () => {
    const info = buildDeviceInfo(env({ userAgent: ANDROID_FIREFOX_UA }))

    expect(info).toMatchObject({
      os: { name: 'Android', version: '14' },
      browser: { name: 'Firefox', version: '131' },
    })
    expect(info.deviceModel).toBeUndefined()
  })

  it('does not record Firefox on an Android tablet as having a "Tablet" model', () => {
    expect(buildDeviceInfo(env({ userAgent: ANDROID_FIREFOX_TABLET_UA })).deviceModel).toBeUndefined()
  })

  it.each([
    ['15.0.0', '11'],
    ['13.0.0', '11'],
    ['10.0.0', '10'],
    ['0.3.0', undefined],
  ])('maps Windows Client Hints platform version %s to Windows %s', (platformVersion, osVersion) => {
    const info = buildDeviceInfo(
      env({ userAgent: WINDOWS_EDGE_UA, clientHints: { platform: 'Windows', platformVersion, model: '' } }),
    )

    expect(info.os).toEqual({ name: 'Windows', version: osVersion })
    expect(info.browser).toEqual({ name: 'Edge', version: '130' })
    expect(info.deviceModel).toBeUndefined()
  })

  it('reads Windows from the user agent with no version when there are no Client Hints', () => {
    const info = buildDeviceInfo(env({ userAgent: WINDOWS_EDGE_UA }))

    expect(info.os).toEqual({ name: 'Windows' })
  })

  it('reads a Chromebook as ChromeOS', () => {
    expect(buildDeviceInfo(env({ userAgent: CHROMEBOOK_UA })).os).toEqual({ name: 'ChromeOS' })
  })

  it.each(['Chrome OS', 'Chromium OS'])(
    'reports the Client Hints platform %s with the same ChromeOS name as the user-agent fallback',
    platform => {
      const info = buildDeviceInfo(
        env({ userAgent: CHROMEBOOK_UA, clientHints: { platform, platformVersion: '16093.68.0', model: '' } }),
      )

      expect(info.os).toEqual({ name: 'ChromeOS', version: '16093' })
    },
  )

  it('passes through the Chromium-only network signals', () => {
    expect(buildDeviceInfo(env({ connectionType: '3g', saveData: true }))).toMatchObject({
      connectionType: '3g',
      saveData: true,
    })
  })

  it('rounds the pixel ratio that browser zoom produces', () => {
    expect(buildDeviceInfo(env({ pixelRatio: 1.100000023841858 })).pixelRatio).toBe(1.1)
  })

  it('leaves OS, browser and model empty for a missing user agent', () => {
    const info = buildDeviceInfo(env({ userAgent: undefined, maxTouchPoints: 0 }))

    expect(info.os).toBeUndefined()
    expect(info.browser).toBeUndefined()
    expect(info.deviceModel).toBeUndefined()
  })
})
