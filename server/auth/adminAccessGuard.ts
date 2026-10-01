import type { Request, Response, NextFunction, RequestHandler } from 'express'
import config from '../config'
import requireAdminRole from './requireAdminRole'
import requireAdminUsername from './requireAdminUsername'

// Signed-in check only - any HMPPS Auth user is allowed through. Like the other gates, this looks
// at res.locals.adminUser (the HMPPS Auth identity), never res.locals.user.
export function requireAdminSignIn(req: Request, res: Response, next: NextFunction) {
  if (!res.locals.adminUser?.token) {
    req.session.returnTo = req.originalUrl
    return res.redirect('/admin/sign-in')
  }
  return next()
}

export const isAdminOpenToAllUsers = (): boolean =>
  config.adminAllowAllUsers && config.environmentName.toLowerCase() === 'dev'

// The gate every /admin/* router uses: open to any signed-in admin in dev when
// ADMIN_ALLOW_ALL_USERS is on, otherwise the username allowlist or role check
// (see config.adminRestrictByUsername).
export default function adminAccessGuard(): RequestHandler {
  if (isAdminOpenToAllUsers()) return requireAdminSignIn
  return config.adminRestrictByUsername ? requireAdminUsername : requireAdminRole
}
