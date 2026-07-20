import type { Request, Response } from 'express'
import { loadCurrentUser, requireAuthentication } from './currentUser'
import {
  appSessionCookieName,
  adminPreviewSessionCookieName,
  getAppSessionCookie,
  getAdminPreviewSessionCookie,
} from './cookies'
import { createAuthenticatedUserSession, saveAuthenticatedUserSession } from './sessionStore'

jest.mock('../../logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}))

function buildReq(cookies: Record<string, string> = {}): Request {
  return { id: 'correlation-1', cookies } as unknown as Request
}

function buildRes(): Response {
  return {
    locals: {},
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as Response
}

describe('loadCurrentUser', () => {
  const next = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does nothing when there is no session cookie of either kind', async () => {
    const req = buildReq()
    const res = buildRes()

    await loadCurrentUser(req, res, next)

    expect(res.locals.user).toBeUndefined()
    expect(next).toHaveBeenCalled()
  })

  it('loads a real citizen session from the app session cookie', async () => {
    const session = createAuthenticatedUserSession({
      userId: 'one-login-subject',
      registeredUserDetails: { id: 'id-1', personReference: 'X123456', status: 'ACTIVE', createdAt: '2026-01-01' },
    })
    await saveAuthenticatedUserSession(session)
    const req = buildReq({ [appSessionCookieName]: session.id })
    const res = buildRes()

    await loadCurrentUser(req, res, next)

    expect(res.locals.user?.registeredUserDetails?.personReference).toBe('X123456')
    expect(res.cookie).toHaveBeenCalledWith(appSessionCookieName, session.id, expect.anything())
  })

  it('loads an admin preview session from the admin-preview cookie', async () => {
    const session = createAuthenticatedUserSession({
      userId: 'admin-preview:admin1',
      adminPreviewSubject: { personReference: 'X999999', startedAt: '2026-01-01T00:00:00Z' },
      previewedByAdmin: 'admin1',
    })
    await saveAuthenticatedUserSession(session)
    const req = buildReq({ [adminPreviewSessionCookieName]: session.id })
    const res = buildRes()

    await loadCurrentUser(req, res, next)

    expect(res.locals.user?.previewedByAdmin).toBe('admin1')
    expect(res.cookie).toHaveBeenCalledWith(adminPreviewSessionCookieName, session.id, expect.anything())
  })

  it('prefers the admin-preview session over an unrelated citizen session sharing the same browser', async () => {
    const citizenSession = createAuthenticatedUserSession({
      userId: 'one-login-subject',
      registeredUserDetails: { id: 'id-1', personReference: 'X123456', status: 'ACTIVE', createdAt: '2026-01-01' },
    })
    const previewSession = createAuthenticatedUserSession({
      userId: 'admin-preview:admin1',
      adminPreviewSubject: { personReference: 'X999999', startedAt: '2026-01-01T00:00:00Z' },
      previewedByAdmin: 'admin1',
    })
    await saveAuthenticatedUserSession(citizenSession)
    await saveAuthenticatedUserSession(previewSession)
    const req = buildReq({
      [appSessionCookieName]: citizenSession.id,
      [adminPreviewSessionCookieName]: previewSession.id,
    })
    const res = buildRes()

    await loadCurrentUser(req, res, next)

    expect(res.locals.user?.previewedByAdmin).toBe('admin1')
    // Neither the citizen session nor its cookie should be touched while an
    // admin-preview session takes precedence - the two must coexist rather
    // than one clobbering the other.
    expect(res.cookie).not.toHaveBeenCalledWith(appSessionCookieName, expect.anything(), expect.anything())
  })

  it('clears only the admin-preview cookie when that session has expired, leaving any citizen cookie alone', async () => {
    const req = buildReq({
      [appSessionCookieName]: 'some-unrelated-citizen-session-id',
      [adminPreviewSessionCookieName]: 'expired-preview-session-id',
    })
    const res = buildRes()

    await loadCurrentUser(req, res, next)

    expect(res.locals.sessionTimedOut).toBe(true)
    expect(res.clearCookie).toHaveBeenCalledWith(adminPreviewSessionCookieName, expect.anything())
    expect(res.clearCookie).not.toHaveBeenCalledWith(appSessionCookieName, expect.anything())
  })
})

describe('requireAuthentication', () => {
  const next = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls next when res.locals.user is set', () => {
    const req = buildReq()
    const res = buildRes()
    res.locals.user = {} as never

    requireAuthentication(req, res, next)

    expect(next).toHaveBeenCalled()
  })

  it('redirects to session-timeout when an admin-preview cookie is present but no user was loaded', () => {
    const req = buildReq({ [adminPreviewSessionCookieName]: 'some-id' })
    const res = { locals: {}, redirect: jest.fn() } as unknown as Response

    requireAuthentication(req, res, next)

    expect(res.redirect).toHaveBeenCalledWith('/session-timeout')
  })

  it('redirects to sign-in with returnTo when there is no session cookie of either kind', () => {
    const req = { ...buildReq(), originalUrl: '/details' } as Request
    const res = { locals: {}, redirect: jest.fn() } as unknown as Response

    requireAuthentication(req, res, next)

    expect(res.redirect).toHaveBeenCalledWith('/?returnTo=%2Fdetails')
  })
})

// Sanity check the cookie helpers themselves read from the right key.
describe('cookie getters', () => {
  it('read from their own distinct cookie names', () => {
    const req = buildReq({ [appSessionCookieName]: 'a', [adminPreviewSessionCookieName]: 'b' })

    expect(getAppSessionCookie(req)).toBe('a')
    expect(getAdminPreviewSessionCookie(req)).toBe('b')
  })
})
