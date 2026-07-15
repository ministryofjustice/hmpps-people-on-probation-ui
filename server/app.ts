import express from 'express'
import cookieParser from 'cookie-parser'

import createError from 'http-errors'

import nunjucksSetup from './utils/nunjucksSetup'
import errorHandler from './errorHandler'
import { appInsightsMiddleware } from './utils/azureAppInsights'

import setUpAuthentication from './middleware/setUpAuthentication'
import setUpCsrf from './middleware/setUpCsrf'
import setUpHealthChecks from './middleware/setUpHealthChecks'
import setUpStaticResources from './middleware/setUpStaticResources'
import setUpWebRequestParsing from './middleware/setupRequestParsing'
import setUpWebSecurity from './middleware/setUpWebSecurity'
import setUpWebSession from './middleware/setUpWebSession'

import routes from './routes'
import analyticsRoutes from './routes/analytics'
import type { Services } from './services'

export default function createApp(services: Services): express.Application {
  const app = express()

  app.set('json spaces', 2)
  app.set('trust proxy', true)
  app.set('port', process.env.PORT || 3000)

  app.use(appInsightsMiddleware())
  app.use(setUpHealthChecks(services.applicationInfo))
  app.use(setUpWebSecurity())
  app.use(cookieParser())
  app.use(setUpWebSession())
  app.use(setUpWebRequestParsing())
  app.use(setUpStaticResources())
  nunjucksSetup(app)
  app.use(setUpAuthentication(services.auditService))

  // Mounted ahead of CSRF protection: this is a fire-and-forget telemetry
  // sink (no session-mutating side effects) that must accept
  // navigator.sendBeacon() requests, which cannot carry a CSRF token, and
  // must work on unauthenticated pages (e.g. sign-in failures) too.
  app.use('/analytics', analyticsRoutes())

  app.use(setUpCsrf())

  app.use(routes(services))

  app.get('/cookies', (_req, res) => {
    res.render('pages/cookies')
  })

  app.get('/privacy', (_req, res) => {
    res.render('pages/privacy')
  })

  app.get('/accessibility', (_req, res) => {
    res.render('pages/accessibility')
  })

  app.get('/autherror', (_req, res) => {
    res.status(403)
    res.render('pages/auth-error')
  })

  app.get('/invite-expired', (_req, res) => {
    res.status(410)
    res.render('pages/invite-expired')
  })

  app.get('/sign-in-error', (_req, res) => {
    res.status(500)
    res.render('pages/sign-in-error')
  })

  app.use((_req, _res, next) => next(createError(404, 'Not found')))
  app.use(errorHandler(process.env.NODE_ENV === 'production'))

  return app
}
