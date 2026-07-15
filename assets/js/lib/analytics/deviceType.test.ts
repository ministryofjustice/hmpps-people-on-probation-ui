import { detectDeviceType } from './deviceType'

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const ANDROID_PHONE_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const ANDROID_TABLET_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const WINDOWS_DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const MAC_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

describe('detectDeviceType', () => {
  it('returns unknown for an undefined user agent', () => {
    expect(detectDeviceType(undefined)).toBe('unknown')
  })

  it('returns unknown for a null user agent', () => {
    expect(detectDeviceType(null)).toBe('unknown')
  })

  it('returns unknown for an empty string user agent', () => {
    expect(detectDeviceType('')).toBe('unknown')
  })

  it('returns unknown for an unrecognised user agent', () => {
    expect(detectDeviceType('SomeCustomBot/1.0')).toBe('unknown')
  })

  it('classifies an iPhone user agent as mobile', () => {
    expect(detectDeviceType(IPHONE_UA)).toBe('mobile')
  })

  it('classifies an Android phone user agent as mobile', () => {
    expect(detectDeviceType(ANDROID_PHONE_UA)).toBe('mobile')
  })

  it('classifies an iPad user agent as tablet', () => {
    expect(detectDeviceType(IPAD_UA)).toBe('tablet')
  })

  it('classifies an Android tablet user agent as tablet (not mobile)', () => {
    expect(detectDeviceType(ANDROID_TABLET_UA)).toBe('tablet')
  })

  it('classifies a Windows desktop user agent as desktop', () => {
    expect(detectDeviceType(WINDOWS_DESKTOP_UA)).toBe('desktop')
  })

  it('classifies a Mac desktop user agent as desktop', () => {
    expect(detectDeviceType(MAC_DESKTOP_UA)).toBe('desktop')
  })

  it('is case-insensitive', () => {
    expect(detectDeviceType(IPHONE_UA.toUpperCase())).toBe('mobile')
  })
})
