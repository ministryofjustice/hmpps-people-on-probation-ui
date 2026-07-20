import jwt from 'jsonwebtoken'
import type { Request, Response } from 'express'
import requireAdminUsername from './requireAdminUsername'
import config from '../config'

jest.mock('../../logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}))

function createToken(userName: string) {
  return jwt.sign({ user_name: userName, auth_source: 'auth' }, 'secret', { expiresIn: '1h' })
}

describe('requireAdminUsername', () => {
  let req: Request
  let originalUsernames: string[]
  const next = jest.fn()

  function buildRes(token?: string): Response {
    return {
      locals: token ? { adminUser: { token, username: 'ADMIN1' } } : {},
      redirect: jest.fn(),
    } as unknown as Response
  }

  beforeEach(() => {
    jest.resetAllMocks()
    originalUsernames = config.adminAuthorisedUsernames
    req = { id: 'correlation-1', session: {} } as unknown as Request
  })

  afterEach(() => {
    config.adminAuthorisedUsernames = originalUsernames
  })

  it('redirects to /admin/sign-in and stashes returnTo when there is no admin token', () => {
    const res = buildRes()

    requireAdminUsername(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.redirect).toHaveBeenCalledWith('/admin/sign-in')
  })

  it('redirects to /admin/auth-error when there are no authorised usernames configured', () => {
    config.adminAuthorisedUsernames = []
    const res = buildRes(createToken('ADMIN1'))

    requireAdminUsername(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.redirect).toHaveBeenCalledWith('/admin/auth-error')
  })

  it('redirects to /admin/auth-error when the username is not on the allowlist', () => {
    config.adminAuthorisedUsernames = ['OTHERUSER']
    const res = buildRes(createToken('ADMIN1'))

    requireAdminUsername(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.redirect).toHaveBeenCalledWith('/admin/auth-error')
  })

  it('calls next when the username is on the allowlist', () => {
    config.adminAuthorisedUsernames = ['ADMIN1']
    const res = buildRes(createToken('admin1'))

    requireAdminUsername(req, res, next)

    expect(next).toHaveBeenCalled()
    expect(res.redirect).not.toHaveBeenCalled()
  })
})
