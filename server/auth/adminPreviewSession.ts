import type { Request, Response } from 'express'
import type { Services } from '../services'
import { getAdminPreviewSessionCookie, clearAdminPreviewSessionCookie } from './cookies'
import { getAuthenticatedUserSession, deleteAuthenticatedUserSession, getSessionCrn } from './sessionStore'
import logger from '../../logger'

// Ends the admin "preview as user" session (server/routes/admin.ts) tied to
// the admin-preview session cookie, if any — shared by /admin/preview/end
// (exit preview, stay signed in to HMPPS Auth) and /admin/sign-out (full
// HMPPS Auth logout, which must also drop any active preview so it doesn't
// linger past the admin's own session).
export default async function endActiveAdminPreviewSession(req: Request, res: Response, services: Services) {
  const previewSessionId = getAdminPreviewSessionCookie(req)
  const session = previewSessionId ? await getAuthenticatedUserSession(previewSessionId) : null

  if (!session?.previewedByAdmin) return

  await deleteAuthenticatedUserSession(session.id)
  clearAdminPreviewSessionCookie(res)

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
