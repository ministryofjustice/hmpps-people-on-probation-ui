import type { Request, Response } from 'express'
import type { Services } from '../services'
import { getAppSessionCookie, clearAppSessionCookie } from './cookies'
import { getAuthenticatedUserSession, deleteAuthenticatedUserSession, getSessionCrn } from './sessionStore'
import logger from '../../logger'

// Ends the admin "preview as user" session (server/routes/admin.ts) tied to
// the current app session cookie, if any — shared by /admin/preview/end
// (exit preview, stay signed in to HMPPS Auth) and /admin/sign-out (full
// HMPPS Auth logout, which must also drop any active preview so it doesn't
// linger past the admin's own session).
export default async function endActiveAdminPreviewSession(req: Request, res: Response, services: Services) {
  const appSessionId = getAppSessionCookie(req)
  const session = appSessionId ? await getAuthenticatedUserSession(appSessionId) : null

  if (!session?.previewedByAdmin) return

  await deleteAuthenticatedUserSession(session.id)
  clearAppSessionCookie(res)

  if (services.auditService) {
    try {
      await services.auditService.logAdminPreviewEnded({
        who: session.previewedByAdmin,
        subjectId: getSessionCrn(session),
        correlationId: req.id,
      })
    } catch (err) {
      logger.warn({ err }, 'Failed to send admin preview ended audit event')
    }
  }
}
