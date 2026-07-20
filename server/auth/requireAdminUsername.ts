import { jwtDecode } from 'jwt-decode'
import type { Request, Response, NextFunction } from 'express'
import config from '../config'
import logger from '../../logger'

// TEMPORARY: alternative gate for /admin/* routes, used in place of
// requireAdminRole while the admin cohort's role is still being agreed with
// the auth team. Restricts access to a fixed list of HMPPS usernames instead
// of a role — see config.adminRestrictByUsername for the switch between the
// two. Like requireAdminRole, this checks res.locals.adminUser (the HMPPS
// Auth identity set by setUpAdminAuthentication.ts), never res.locals.user,
// and is a decode-only check (no signature verification) purely for
// username extraction.
export default function requireAdminUsername(req: Request, res: Response, next: NextFunction) {
  if (!res.locals.adminUser?.token) {
    req.session.returnTo = req.originalUrl
    return res.redirect('/admin/sign-in')
  }

  const { user_name: userName } = jwtDecode(res.locals.adminUser.token) as { user_name?: string }

  if (config.adminAuthorisedUsernames.includes((userName ?? '').toUpperCase())) {
    return next()
  }

  logger.warn(
    { correlationId: req.id, username: res.locals.adminUser.username },
    'Admin sign-in succeeded but username is not on the admin preview allowlist',
  )
  return res.redirect('/admin/auth-error')
}
