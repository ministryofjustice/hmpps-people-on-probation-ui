import type { Request } from 'express'
import { getCsrfTokenFromRequest } from './setUpCsrf'

const req = (body: unknown, headers: Record<string, string | string[]> = {}): Request =>
  ({ body, headers }) as unknown as Request

describe('getCsrfTokenFromRequest', () => {
  it('takes the token from the request body (forms and the chat widget)', () => {
    expect(getCsrfTokenFromRequest(req({ _csrf: 'body-token' }))).toBe('body-token')
  })

  it('falls back to the X-CSRF-Token header when the body carries no token (raw audio uploads)', () => {
    expect(getCsrfTokenFromRequest(req(Buffer.from('audio'), { 'x-csrf-token': 'header-token' }))).toBe('header-token')
    expect(getCsrfTokenFromRequest(req(undefined, { 'x-csrf-token': 'header-token' }))).toBe('header-token')
  })

  it('prefers the body token when both are present', () => {
    expect(getCsrfTokenFromRequest(req({ _csrf: 'body-token' }, { 'x-csrf-token': 'header-token' }))).toBe('body-token')
  })

  it('returns undefined for a missing or malformed token so csrf-sync rejects the request', () => {
    expect(getCsrfTokenFromRequest(req({}))).toBeUndefined()
    expect(getCsrfTokenFromRequest(req({ _csrf: 123 }))).toBeUndefined()
    expect(getCsrfTokenFromRequest(req(undefined, { 'x-csrf-token': ['a', 'b'] }))).toBeUndefined()
  })
})
