import jwt from 'jsonwebtoken'
import type { Request, Response } from 'express'
import requireAdminRole from './requireAdminRole'
import config from '../config'

jest.mock('../../logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}))

function createToken(authorities: string[]) {
  return jwt.sign({ user_name: 'ADMIN1', auth_source: 'auth', authorities }, 'secret', { expiresIn: '1h' })
}

describe('requireAdminRole', () => {
  let req: Request
  let originalRoles: string[]
  const next = jest.fn()

  function buildRes(token?: string): Response {
    return {
      locals: token ? { adminUser: { token, username: 'ADMIN1' } } : {},
      redirect: jest.fn(),
    } as unknown as Response
  }

  beforeEach(() => {
    jest.resetAllMocks()
    originalRoles = config.adminAuthorisedRoles
    req = { id: 'correlation-1', session: {} } as unknown as Request
  })

  afterEach(() => {
    config.adminAuthorisedRoles = originalRoles
  })

  it('redirects to /admin/sign-in and stashes returnTo when there is no admin token', () => {
    const res = buildRes()

    requireAdminRole(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.redirect).toHaveBeenCalledWith('/admin/sign-in')
  })

  it('redirects to /admin/auth-error when there are no authorised roles configured', () => {
    config.adminAuthorisedRoles = []
    const res = buildRes(createToken(['ROLE_ANYTHING']))

    requireAdminRole(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.redirect).toHaveBeenCalledWith('/admin/auth-error')
  })

  it('redirects to /admin/auth-error when the user lacks a required role', () => {
    config.adminAuthorisedRoles = ['SOME_REQUIRED_ROLE']
    const res = buildRes(createToken([]))

    requireAdminRole(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.redirect).toHaveBeenCalledWith('/admin/auth-error')
  })

  it('calls next when the user has the required role', () => {
    config.adminAuthorisedRoles = ['SOME_REQUIRED_ROLE']
    const res = buildRes(createToken(['ROLE_SOME_REQUIRED_ROLE']))

    requireAdminRole(req, res, next)

    expect(next).toHaveBeenCalled()
    expect(res.redirect).not.toHaveBeenCalled()
  })

  it('normalises required roles configured without the ROLE_ prefix', () => {
    config.adminAuthorisedRoles = ['ROLE_SOME_REQUIRED_ROLE']
    const res = buildRes(createToken(['ROLE_SOME_REQUIRED_ROLE']))

    requireAdminRole(req, res, next)

    expect(next).toHaveBeenCalled()
    expect(res.redirect).not.toHaveBeenCalled()
  })
})
