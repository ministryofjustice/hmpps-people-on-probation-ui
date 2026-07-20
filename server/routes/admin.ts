import { Router, Request } from 'express'
import type { SanitisedError } from '@ministryofjustice/hmpps-rest-client'
import type { Services } from '../services'
import requireAdminRole from '../auth/requireAdminRole'
import requireAdminUsername from '../auth/requireAdminUsername'
import config from '../config'
import isValidCrnFormat from '../utils/crn'
import {
  createAuthenticatedUserSession,
  saveAuthenticatedUserSession,
  getAuthenticatedUserSession,
  getAuthenticatedUserSessionTtlSeconds,
  getSessionCrn,
} from '../auth/sessionStore'
import { getAppSessionCookie, setAppSessionCookie } from '../auth/cookies'
import endActiveAdminPreviewSession from '../auth/adminPreviewSession'
import logger from '../../logger'

type SearchOutcome = 'found' | 'not-found' | 'invalid-format'

async function auditSearchAttempt(
  services: Services,
  req: Request,
  who: string | undefined,
  crn: string | undefined,
  outcome: SearchOutcome,
) {
  if (!services.auditService || !who) return
  try {
    await services.auditService.logAdminPreviewSearchAttempt({
      who,
      subjectId: crn,
      correlationId: req.id,
      details: { outcome },
    })
  } catch (err) {
    logger.warn({ err }, 'Failed to send admin preview search attempt audit event')
  }
}

// Admin "preview as user" feature. Every route here sits behind
// requireAdminRole (checks res.locals.adminUser, the HMPPS Auth identity —
// see setUpAdminAuthentication.ts), never res.locals.user. On a successful
// CRN search, /search mints a normal entry in the same session store/cookie
// every citizen session already uses (server/auth/sessionStore.ts), marked
// with previewedByAdmin — from that point on every existing citizen-facing
// route works completely unchanged, with zero special-casing.
export default function adminRoutes(services: Services): Router {
  const router = Router()

  // See config.adminRestrictByUsername for why this can switch between the
  // two gates without touching this file again.
  router.use(config.adminRestrictByUsername ? requireAdminUsername : requireAdminRole)

  router.get('/search', async (req, res, next) => {
    try {
      const appSessionId = getAppSessionCookie(req)
      const currentSession = appSessionId ? await getAuthenticatedUserSession(appSessionId) : null

      return res.render('pages/admin/search', {
        activePreviewCrn: currentSession?.previewedByAdmin ? getSessionCrn(currentSession) : undefined,
      })
    } catch (error) {
      return next(error)
    }
  })

  router.post('/search', async (req, res, next) => {
    try {
      const adminUsername = res.locals.adminUser?.username
      const rawCrn = typeof req.body.crn === 'string' ? req.body.crn.trim() : ''
      const crn = rawCrn.toUpperCase()

      if (!isValidCrnFormat(crn)) {
        await auditSearchAttempt(services, req, adminUsername, undefined, 'invalid-format')
        return res.render('pages/admin/search', {
          errorMessage: 'Enter a CRN in the correct format, like X123456',
          crn: rawCrn,
        })
      }

      try {
        await services.peopleOnProbationService.getPersonalDetails(crn)
      } catch (err) {
        if ((err as SanitisedError | null | undefined)?.responseStatus === 404) {
          await auditSearchAttempt(services, req, adminUsername, crn, 'not-found')
          return res.render('pages/admin/search', {
            errorMessage: 'No probation account found for this CRN',
            crn: rawCrn,
          })
        }
        throw err
      }

      await auditSearchAttempt(services, req, adminUsername, crn, 'found')

      const previewSession = createAuthenticatedUserSession({
        userId: `admin-preview:${adminUsername}`,
        adminPreviewSubject: { personReference: crn, startedAt: new Date().toISOString() },
        previewedByAdmin: adminUsername,
      })
      await saveAuthenticatedUserSession(previewSession)
      setAppSessionCookie(res, previewSession.id, getAuthenticatedUserSessionTtlSeconds())

      if (services.auditService) {
        try {
          await services.auditService.logAdminPreviewStarted({
            who: adminUsername,
            subjectId: crn,
            correlationId: req.id,
          })
        } catch (err) {
          logger.warn({ err }, 'Failed to send admin preview started audit event')
        }
      }

      return res.redirect('/')
    } catch (error) {
      return next(error)
    }
  })

  router.post('/preview/end', async (req, res, next) => {
    try {
      await endActiveAdminPreviewSession(req, res, services)
      return res.redirect('/admin/search')
    } catch (error) {
      return next(error)
    }
  })

  return router
}
