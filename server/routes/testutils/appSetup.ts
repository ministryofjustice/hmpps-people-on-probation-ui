import express, { Express } from 'express'
import cookieParser from 'cookie-parser'
import { NotFound } from 'http-errors'
import { randomUUID } from 'crypto'
import routes from '../index'
import nunjucksSetup from '../../utils/nunjucksSetup'
import errorHandler from '../../errorHandler'
import type { Services } from '../../services'
import AuditService from '../../services/auditService'
import setUpWebSession from '../../middleware/setUpWebSession'
import { appSessionCookieName } from '../../auth/cookies'
import { createAuthenticatedUserSession, saveAuthenticatedUserSession } from '../../auth/sessionStore'

jest.mock('../../services/auditService')

export const flashProvider = jest.fn()

function appSetup(services: Services, production: boolean): Express {
  const app = express()

  app.set('view engine', 'njk')

  nunjucksSetup(app)
  app.use(cookieParser())
  app.use(setUpWebSession())
  app.use((req, res, next) => {
    req.flash = flashProvider
    next()
  })
  app.use((req, res, next) => {
    req.id = randomUUID()
    next()
  })
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))
  app.use(routes(services))

  app.get('/cookies', (_req, res) => res.render('pages/cookies'))
  app.get('/privacy', (_req, res) => res.render('pages/privacy'))
  app.get('/accessibility', (_req, res) => res.render('pages/accessibility'))
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

  app.use((req, res, next) => next(new NotFound()))
  app.use(errorHandler(production))

  return app
}

export async function createAppSessionCookie(
  personReference?: string,
  lastSignedInAt?: string,
  isRegistrationSession = false,
) {
  const session = createAuthenticatedUserSession({
    userId: 'one-login-subject',
    email: 'user@example.com',
    isRegistrationSession,
    registeredUserDetails: personReference
      ? {
          id: 'registered-user-id',
          personReference,
          status: 'ACTIVE',
          createdAt: '2026-01-01T00:00:00Z',
          lastSignedInAt,
        }
      : undefined,
  })
  await saveAuthenticatedUserSession(session)
  return `${appSessionCookieName}=${session.id}`
}

export function appWithAllRoutes({
  production = false,
  services = {
    auditService: new AuditService() as jest.Mocked<AuditService>,
  },
}: {
  production?: boolean
  services?: Partial<Services>
}): Express {
  return appSetup(services as Services, production)
}
