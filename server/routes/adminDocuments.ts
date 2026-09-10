import { Router, Request } from 'express'
import type { SanitisedError } from '@ministryofjustice/hmpps-rest-client'
import type { Services } from '../services'
import requireAdminRole from '../auth/requireAdminRole'
import requireAdminUsername from '../auth/requireAdminUsername'
import config from '../config'
import isValidCrnFormat from '../utils/crn'
import { formatPersonName } from '../utils/utils'
import { DOCUMENT_TYPE_UPLOAD_OPTIONS, isValidDocumentType, isValidDocumentName } from '../utils/documentTypes'
import logger from '../../logger'

async function auditDocumentUploaded(services: Services, req: Request, who: string | undefined, crn: string) {
  if (!services.auditService || !who) return
  try {
    await services.auditService.logAdminDocumentUploaded({
      who,
      subjectId: crn,
      correlationId: req.id,
    })
  } catch (err) {
    logger.warn({ err }, 'Failed to send admin document uploaded audit event')
  }
}

// Admin court order document upload. Sits behind the same admin gate as
// server/routes/admin.ts (requireAdminRole/requireAdminUsername), but is a
// separate router so it can be feature-flagged independently (see
// config.features.documents in server/routes/index.ts) — the "preview as
// user" feature can be live without the documents feature being ready, and
// vice versa.
//
// Upload is a single continuous screen: nothing is persisted, in S3 or via
// the API, until the admin explicitly confirms. The client (assets/js/
// documents.ts) previews the locally-selected file with PDF.js before any
// network call, then on confirm: presign -> PUT directly to S3 -> tell the
// API the upload succeeded.
export default function adminDocumentsRoutes(services: Services): Router {
  const router = Router()

  router.use(config.adminRestrictByUsername ? requireAdminUsername : requireAdminRole)

  router.get('/upload', async (_req, res) => {
    return res.render('pages/admin/document-upload-search')
  })

  router.get('/upload/confirmed', async (_req, res) => {
    return res.render('pages/admin/document-upload-confirmed')
  })

  router.post('/upload', async (req, res, next) => {
    try {
      const rawCrn = typeof req.body.crn === 'string' ? req.body.crn.trim() : ''
      const crn = rawCrn.toUpperCase()

      if (!isValidCrnFormat(crn)) {
        return res.render('pages/admin/document-upload-search', {
          errorMessage: 'Enter a CRN in the correct format, like X123456',
          crn: rawCrn,
        })
      }

      let personName: string | undefined
      try {
        const personalDetails = await services.peopleOnProbationService.getPersonalDetails(crn)
        personName = formatPersonName(personalDetails.name)
      } catch (err) {
        if ((err as SanitisedError | null | undefined)?.responseStatus === 404) {
          logger.info({ crn }, 'Document upload CRN search: no probation account found')
          return res.render('pages/admin/document-upload-search', {
            errorMessage: 'No probation account found for this CRN',
            crn: rawCrn,
          })
        }
        throw err
      }

      logger.info({ crn, who: res.locals.adminUser?.username }, 'Document upload CRN search succeeded')

      return res.render('pages/admin/document-upload', {
        crn,
        personName,
        documentTypeOptions: DOCUMENT_TYPE_UPLOAD_OPTIONS,
      })
    } catch (error) {
      return next(error)
    }
  })

  router.post('/upload/presign', async (req, res, next) => {
    try {
      const crn = typeof req.body.crn === 'string' ? req.body.crn.trim().toUpperCase() : ''
      const { documentType } = req.body

      if (!isValidCrnFormat(crn)) return res.status(400).json({ error: 'Invalid CRN' })
      if (!isValidDocumentType(documentType)) return res.status(400).json({ error: 'Invalid document type' })

      logger.info({ crn, documentType }, 'Requesting presigned document upload URL')
      const presign = await services.peopleOnProbationService.presignDocumentUpload(crn, documentType)
      // Deliberately not logging presign.uploadUrl - it's a temporary credential.
      logger.info({ crn, s3Key: presign.s3Key }, 'Presigned document upload URL obtained')
      return res.json(presign)
    } catch (error) {
      return next(error)
    }
  })

  router.post('/upload/confirm', async (req, res, next) => {
    try {
      const crn = typeof req.body.crn === 'string' ? req.body.crn.trim().toUpperCase() : ''
      const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
      const s3Key = typeof req.body.s3Key === 'string' ? req.body.s3Key : ''
      const { documentType } = req.body

      if (!isValidCrnFormat(crn) || !isValidDocumentName(name) || !s3Key || !isValidDocumentType(documentType)) {
        logger.info(
          { crn, documentType, s3Key: s3Key || undefined },
          'Document upload confirm rejected: invalid details',
        )
        return res.status(400).json({ error: 'Missing or invalid document details' })
      }

      // Deliberately not logging the admin-entered `name` - free text, not needed for tracing.
      logger.info({ crn, documentType, s3Key }, 'Confirming document upload')
      const document = await services.peopleOnProbationService.createDocument(crn, { name, s3Key, documentType })
      logger.info({ crn, documentId: document.id }, 'Document upload confirmed')

      const adminUsername = res.locals.adminUser?.username
      await auditDocumentUploaded(services, req, adminUsername, crn)

      return res.json(document)
    } catch (error) {
      return next(error)
    }
  })

  return router
}
