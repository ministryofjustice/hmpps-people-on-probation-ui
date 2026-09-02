import { Router } from 'express'

import type { Services } from '../services'
import { requireAuthentication } from '../auth/currentUser'
import { getSessionCrn } from '../auth/sessionStore'
import { formatPractitionerName, formatAddress } from '../utils/utils'

export default function probationOfficerRoutes(services: Services): Router {
  const router = Router()

  router.use(requireAuthentication)

  router.get('/', async (_req, res, next) => {
    try {
      const crn = getSessionCrn(res.locals.user)
      if (!crn) return res.redirect('/autherror')

      const personalDetails = await services.peopleOnProbationService.getPersonalDetails(crn)
      const { practitioner } = personalDetails
      const officer = practitioner
        ? {
            name: formatPractitionerName(practitioner.name),
            phoneNumber: practitioner.team?.telephoneNumber,
            officeAddress: formatAddress(practitioner.team?.officeAddresses?.[0]),
            officeLocationUrl: practitioner.officeLocationUrl,
          }
        : null

      return res.render('pages/probation-officer', {
        officer: officer && (officer.name || officer.phoneNumber || officer.officeAddress.length) ? officer : null,
      })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
