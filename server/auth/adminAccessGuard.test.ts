import type { Request, Response } from 'express'
import adminAccessGuard, { requireAdminSignIn } from './adminAccessGuard'
import requireAdminRole from './requireAdminRole'
import requireAdminUsername from './requireAdminUsername'
import config from '../config'

describe('adminAccessGuard', () => {
  const original = {
    adminAllowAllUsers: config.adminAllowAllUsers,
    adminRestrictByUsername: config.adminRestrictByUsername,
    environmentName: config.environmentName,
  }

  afterEach(() => {
    Object.assign(config, original)
  })

  it('lets any signed-in admin through in dev when ADMIN_ALLOW_ALL_USERS is on', () => {
    Object.assign(config, { adminAllowAllUsers: true, adminRestrictByUsername: true, environmentName: 'DEV' })
    expect(adminAccessGuard()).toBe(requireAdminSignIn)
  })

  it.each(['PRE-PRODUCTION', 'PRODUCTION', ''])('ignores ADMIN_ALLOW_ALL_USERS when the environment is "%s"', env => {
    Object.assign(config, { adminAllowAllUsers: true, adminRestrictByUsername: true, environmentName: env })
    expect(adminAccessGuard()).toBe(requireAdminUsername)
  })

  it('uses the username allowlist when restricted by username', () => {
    Object.assign(config, { adminAllowAllUsers: false, adminRestrictByUsername: true, environmentName: 'DEV' })
    expect(adminAccessGuard()).toBe(requireAdminUsername)
  })

  it('uses the role check otherwise', () => {
    Object.assign(config, { adminAllowAllUsers: false, adminRestrictByUsername: false, environmentName: 'DEV' })
    expect(adminAccessGuard()).toBe(requireAdminRole)
  })
})

describe('requireAdminSignIn', () => {
  const next = jest.fn()

  beforeEach(() => jest.resetAllMocks())

  it('redirects to /admin/sign-in and stashes returnTo when there is no admin token', () => {
    const req = { originalUrl: '/admin/search', session: {} } as unknown as Request
    const res = { locals: {}, redirect: jest.fn() } as unknown as Response

    requireAdminSignIn(req, res, next)

    expect(res.redirect).toHaveBeenCalledWith('/admin/sign-in')
    expect(req.session.returnTo).toBe('/admin/search')
    expect(next).not.toHaveBeenCalled()
  })

  it('allows any signed-in admin regardless of username or role', () => {
    const req = { session: {} } as unknown as Request
    const res = { locals: { adminUser: { token: 'any-token', username: 'ANYONE' } }, redirect: jest.fn() }

    requireAdminSignIn(req, res as unknown as Response, next)

    expect(next).toHaveBeenCalled()
    expect(res.redirect).not.toHaveBeenCalled()
  })
})
