import { normaliseReturnTo } from './returnTo'

describe('normaliseReturnTo', () => {
  it.each([
    ['undefined', undefined, '/'],
    ['null', null, '/'],
    ['empty string', '', '/'],
    ['relative path without leading slash', 'appointments', '/'],
    ['absolute external URL', 'https://example.com', '/'],
    ['protocol-relative URL', '//example.com', '/'],
    ['leading backslash', '\\example.com', '/'],
    ['backslash after leading slash', '/\\example.com', '/'],
    ['backslash in path', '/appointments\\today', '/'],
    ['local path', '/appointments', '/appointments'],
    ['local path with query string', '/appointments?crn=X123456', '/appointments?crn=X123456'],
  ])('%s', (_: string, input: string | null | undefined, expected: string) => {
    expect(normaliseReturnTo(input)).toEqual(expected)
  })
})
