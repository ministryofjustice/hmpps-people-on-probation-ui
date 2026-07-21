import passport from 'passport'
import { Router } from 'express'
import { Strategy } from 'passport-oauth2'
import config from '../config'
import type { Services } from '../services'
import generateAdminOauthClientToken from '../utils/generateAdminOauthClientToken'
import endActiveAdminPreviewSession from '../auth/adminPreviewSession'
import logger from '../../logger'

passport.serializeUser((user, done) => {
  // Not used but required for Passport
  done(null, user)
})

passport.deserializeUser((user, done) => {
  // Not used but required for Passport
  done(null, user as Express.User)
})

passport.use(
  new Strategy(
    {
      authorizationURL: `${config.apis.hmppsAuth.externalUrl}/oauth/authorize`,
      tokenURL: `${config.apis.hmppsAuth.url}/oauth/token`,
      clientID: config.apis.hmppsAuth.authClientId,
      clientSecret: config.apis.hmppsAuth.authClientSecret,
      callbackURL: `${config.ingressUrl}/admin/sign-in/callback`,
      state: true,
      customHeaders: { Authorization: generateAdminOauthClientToken() },
    },
    (token, refreshToken, params, profile, done) => {
      logger.info({ username: params.user_name }, 'Admin OAuth2 token exchange succeeded')
      return done(null, { token, username: params.user_name, authSource: params.auth_source })
    },
  ),
)

// HMPPS Auth sign-in for the admin "preview as user" feature only. Mounted
// solely under /admin (see server/routes/index.ts) — this is a second,
// independent identity from the citizen One Login flow. It rides on the
// express-session middleware already mounted globally in app.ts (which is
// otherwise unused by the rest of the app), and stores the resulting
// identity on `res.locals.adminUser`, never `res.locals.user` — the latter
// is reserved exclusively for citizen/preview sessions
// (server/auth/sessionStore.ts), so this addition cannot affect
// requireAuthentication or any existing citizen-facing route.
export default function setUpAdminAuthentication(services: Services): Router {
  const router = Router()

  router.use(passport.initialize())
  router.use(passport.session())

  router.get('/auth-error', (req, res) => {
    logger.warn({ correlationId: req.id }, 'Admin auth-error page rendered')
    res.status(401)
    return res.render('pages/admin/auth-error')
  })

  router.get('/sign-in', (req, res, next) => {
    logger.info({ correlationId: req.id }, 'Admin sign-in redirect to HMPPS Auth initiated')
    return passport.authenticate('oauth2')(req, res, next)
  })

  router.get('/sign-in/callback', (req, res, next) =>
    passport.authenticate('oauth2', {
      successReturnToOrRedirect: req.session.returnTo || '/admin/search',
      failureRedirect: '/admin/auth-error',
    })(req, res, next),
  )

  const authUrl = config.apis.hmppsAuth.externalUrl
  const authParameters = `client_id=${config.apis.hmppsAuth.authClientId}&redirect_uri=${config.ingressUrl}/admin/sign-in`

  router.use('/sign-out', async (req, res, next) => {
    const authSignOutUrl = `${authUrl}/sign-out?${authParameters}`

    // A full sign-out must also drop any active preview session tied to
    // this browser (server/routes/admin.ts) - otherwise it would outlive
    // the admin's own HMPPS Auth session. Best-effort only: signing the
    // admin out of HMPPS Auth is the primary action here and must still
    // happen even if this secondary cleanup fails.
    try {
      await endActiveAdminPreviewSession(req, res, services)
    } catch (err) {
      logger.warn({ err, correlationId: req.id }, 'Failed to end active admin preview session during sign-out')
    }

    if (req.user) {
      const { username } = req.user as Express.User
      logger.info({ correlationId: req.id, username }, 'Admin sign-out initiated')
      req.logout(err => {
        if (err) return next(err)
        return req.session.destroy(() => res.redirect(authSignOutUrl))
      })
    } else res.redirect(authSignOutUrl)
  })

  router.use((req, res, next) => {
    res.locals.adminUser = req.user as Express.User
    next()
  })

  return router
}
