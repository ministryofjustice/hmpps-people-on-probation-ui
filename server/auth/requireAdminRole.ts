import { jwtDecode } from 'jwt-decode'
import type { Request, Response, NextFunction } from 'express'
import config from '../config'
import logger from '../../logger'

function hasRequiredRole(token: string, requiredRoles: string[]): boolean {
  if (requiredRoles.length === 0) return false

  const { authorities: roles = [] } = jwtDecode(token) as { authorities?: string[] }
  return requiredRoles.some(role => roles.includes(role))
}

// Gate for /admin/* routes: checks res.locals.adminUser (the HMPPS Auth
// identity set by setUpAdminAuthentication.ts), never res.locals.user (the
// citizen/preview identity) — this is a defence-in-depth, decode-only check
// (no signature verification) purely for role/claim extraction.
export default function requireAdminRole(req: Request, res: Response, next: NextFunction) {
  if (!res.locals.adminUser?.token) {
    req.session.returnTo = req.originalUrl
    return res.redirect('/admin/sign-in')
  }

  const requiredAuthorities = config.adminAuthorisedRoles.map(role =>
    role.startsWith('ROLE_') ? role : `ROLE_${role}`,
  )

  if (!hasRequiredRole(res.locals.adminUser.token, requiredAuthorities)) {
    logger.warn(
      { correlationId: req.id, username: res.locals.adminUser.username },
      'Admin sign-in succeeded but user lacks a required role for admin preview',
    )
    return res.redirect('/admin/auth-error')
  }

  return next()
}
