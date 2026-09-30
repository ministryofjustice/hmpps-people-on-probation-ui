import { Router } from 'express'

import type { Services } from '../services'
import config from '../config'
import { requireAuthentication } from '../auth/currentUser'
import { getSessionCrn } from '../auth/sessionStore'
import { calculateDateProgress, formatDate, formatLicenceSentenceType, isLicenceSentence } from '../utils/utils'
import { findDocumentIdByType } from '../utils/documentTypes'

type LicenceSentenceView = {
  type?: string
  startDate?: string
  endDate?: string
  totalLength?: string
}

export default function licenceRoutes(services: Services): Router {
  const router = Router()

  router.use(requireAuthentication)

  router.get('/', async (_req, res, next) => {
    try {
      const crn = getSessionCrn(res.locals.user)
      if (!crn) return res.redirect('/autherror')

      const sentenceProgress = await services.peopleOnProbationService.getSentences(crn)
      const sentence = sentenceProgress.sentences[0]

      // Community orders (and people with no sentence yet) keep the requirements page.
      if (!isLicenceSentence(sentence)) return res.redirect('/requirements')

      const licenceSentence: LicenceSentenceView = {
        type: formatLicenceSentenceType(sentence.type),
        startDate: formatDate(sentence.startDate),
        endDate: formatDate(sentence.expectedEndDate),
        totalLength:
          sentence.startDate && sentence.expectedEndDate
            ? calculateDateProgress(sentence.startDate, sentence.expectedEndDate).totalLength
            : undefined,
      }

      const licenceDocumentId = config.features.documents
        ? await findDocumentIdByType(services, crn, 'LICENCE_CONDITION')
        : undefined

      return res.render('pages/licence', { licenceSentence, licenceDocumentId })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
