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
  app.use((req, res, next) => next(new NotFound()))
  app.use(errorHandler(production))

  return app
}

export async function createAppSessionCookie(personReference?: string) {
  const session = createAuthenticatedUserSession({
    userId: 'one-login-subject',
    email: 'user@example.com',
    registeredUserDetails: personReference
      ? {
          id: 'registered-user-id',
          personReference,
          status: 'ACTIVE',
          createdAt: '2026-01-01T00:00:00Z',
        }
      : undefined,
  })
  await saveAuthenticatedUserSession(session)
  return `${appSessionCookieName}=${session.id}`
}

export function appWithAllRoutes({
  production = false,
  services = {
    auditService: new AuditService(null) as jest.Mocked<AuditService>,
  },
}: {
  production?: boolean
  services?: Partial<Services>
}): Express {
  return appSetup(services as Services, production)
}
