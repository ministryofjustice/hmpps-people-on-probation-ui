import { Router } from 'express'

import type { Services } from '../services'
import { requireAuthentication } from '../auth/currentUser'
import { formatDateTime, formatPersonName, formatAddress } from '../utils/utils'

export default function probationOfficerRoutes(services: Services): Router {
  const router = Router()

  router.use(requireAuthentication)

  router.get('/', async (_req, res, next) => {
    try {
      const crn = res.locals.user?.registeredUserDetails?.personReference
      if (!crn) return res.redirect('/autherror')

      const personalDetails = await services.peopleOnProbationService.getPersonalDetails(crn)
      const { practitioner } = personalDetails

      return res.render('pages/probation-officer', {
        lastUpdatedAt: formatDateTime(practitioner?.lastUpdatedAt),
        officer: practitioner
          ? {
              name: formatPersonName(practitioner.name),
              phoneNumber: practitioner.telephoneNumber,
              officeAddress: formatAddress(practitioner.team?.officeAddresses?.[0]),
            }
          : null,
      })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
