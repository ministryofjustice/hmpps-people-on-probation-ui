import { Router } from 'express'

import type { Services } from '../services'
import { requireAuthentication } from '../auth/currentUser'
import { formatDate, formatDateTime, formatUnit } from '../utils/utils'
import type { RequirementResponse } from '../data/peopleOnProbationApiClient'

type OrderDetailsView = {
  charge?: string
  type?: string
  startDate?: string
  endDate?: string
}

type RequirementRowView = {
  type: string
  value: string
}

function toRequirementRowView(req: RequirementResponse): RequirementRowView {
  const type = req.type || req.description || 'Requirement'
  const hasAmount = req.required && req.required > 0 && req.unit
  const value = hasAmount ? `${req.required} ${formatUnit(req.unit, req.required)}` : req.description || ''
  return { type, value }
}

export default function requirementsRoutes(services: Services): Router {
  const router = Router()

  router.use(requireAuthentication)

  router.get('/', async (_req, res, next) => {
    try {
      const crn = res.locals.user?.registeredUserDetails?.personReference
      if (!crn) return res.redirect('/autherror')

      const sentenceProgress = await services.peopleOnProbationService.getSentences(crn)
      const sentence = sentenceProgress.sentences[0]

      const orderDetails: OrderDetailsView = {
        // TODO Remove dummy charge when the API returns the charge field
        charge: sentence?.charge ?? 'Dummy charge',
        type: sentence?.type,
        startDate: formatDate(sentence?.startDate),
        endDate: formatDate(sentence?.expectedEndDate),
      }

      const requirements = (sentence?.requirements ?? []).map(toRequirementRowView)

      return res.render('pages/requirements', {
        orderDetails,
        requirements,
        lastUpdatedAt: formatDateTime(sentence?.lastUpdatedAt),
      })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
