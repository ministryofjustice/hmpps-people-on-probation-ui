import { Router } from 'express'
import type { SanitisedError } from '@ministryofjustice/hmpps-rest-client'
import type { Services } from '../services'
import { requireAuthentication } from '../auth/currentUser'
import { getSessionCrn } from '../auth/sessionStore'
import { formatDateWithDay } from '../utils/utils'
import { formatDocumentTypeLabel } from '../utils/documentTypes'
import logger from '../../logger'

export default function documentsRoutes(services: Services): Router {
  const router = Router()

  router.use(requireAuthentication)

  router.get('/', async (_req, res, next) => {
    try {
      const crn = getSessionCrn(res.locals.user)
      if (!crn) return res.redirect('/autherror')

      logger.info({ crn }, 'Fetching documents list')
      const { documents } = await services.peopleOnProbationService.getDocuments(crn)
      logger.info({ crn, count: documents.length }, 'Documents list fetched')

      return res.render('pages/documents', {
        documents: documents.map(document => ({
          id: document.id,
          name: formatDocumentTypeLabel(document.documentType),
          uploadedAt: formatDateWithDay(document.uploadedAt),
        })),
      })
    } catch (error) {
      return next(error)
    }
  })

  router.get('/:id', async (req, res, next) => {
    try {
      const crn = getSessionCrn(res.locals.user)
      if (!crn) return res.redirect('/autherror')

      logger.info({ crn, documentId: req.params.id }, 'Fetching document')

      let document
      try {
        document = await services.peopleOnProbationService.getDocument(crn, req.params.id)
      } catch (err) {
        if ((err as SanitisedError | null | undefined)?.responseStatus === 404) {
          logger.info({ crn, documentId: req.params.id }, 'Document not found')
          return next()
        }
        throw err
      }

      // Deliberately not logging viewUrl - it's a presigned S3 URL, a temporary credential.
      logger.info({ crn, documentId: document.id }, 'Document fetched')

      return res.render('pages/document-view', {
        document: {
          id: document.id,
          name: formatDocumentTypeLabel(document.documentType),
          viewUrl: document.viewUrl,
        },
      })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
