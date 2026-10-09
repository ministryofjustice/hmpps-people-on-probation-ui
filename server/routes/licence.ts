import { Router } from 'express'

import type { Services } from '../services'
import config from '../config'
import { requireAuthentication } from '../auth/currentUser'
import { getSessionCrn } from '../auth/sessionStore'
import type { LicenceConditionResponse } from '../data/peopleOnProbationApiClient'
import { calculateDateProgress, formatDate, formatLicenceSentenceType, isLicenceSentence } from '../utils/utils'
import { findDocumentIdByType } from '../utils/documentTypes'
import {
  LICENCE_ALCOHOL_TAG_CATEGORY_CODE,
  LICENCE_GPS_TAG_CATEGORY_CODE,
  LICENCE_TRAIL_MONITORING_TAG_CATEGORY_CODE,
} from '../utils/categoryCodes'

// Electronic monitoring licence conditions, keyed by main category code, with the tag type as it
// reads in "You need to wear [tagType] tag".
const TAG_TYPES: Record<string, string> = {
  [LICENCE_GPS_TAG_CATEGORY_CODE]: 'a GPS',
  [LICENCE_TRAIL_MONITORING_TAG_CATEGORY_CODE]: 'a trail monitoring',
  [LICENCE_ALCOHOL_TAG_CATEGORY_CODE]: 'an alcohol monitoring',
}

type LicenceTagView = {
  tagType: string
  endDate?: string
}

type LicenceSentenceView = {
  type?: string
  startDate?: string
  endDate?: string
  totalLength?: string
  percentComplete?: number
  remainingDuration?: string
  tags: LicenceTagView[]
}

const toLicenceTags = (licenceConditions: LicenceConditionResponse[] = []): LicenceTagView[] =>
  licenceConditions.flatMap(condition => {
    const tagType = TAG_TYPES[condition.mainCategory?.code ?? '']
    return tagType ? [{ tagType, endDate: formatDate(condition.expectedEndDate) }] : []
  })

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

      const progress =
        sentence.startDate && sentence.expectedEndDate
          ? calculateDateProgress(sentence.startDate, sentence.expectedEndDate)
          : undefined

      const licenceSentence: LicenceSentenceView = {
        type: formatLicenceSentenceType(sentence.type),
        startDate: formatDate(sentence.startDate),
        endDate: formatDate(sentence.expectedEndDate),
        totalLength: progress?.totalLength,
        percentComplete: progress?.percentComplete,
        remainingDuration: progress?.remainingDuration,
        tags: toLicenceTags(sentence.licenceConditions),
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
