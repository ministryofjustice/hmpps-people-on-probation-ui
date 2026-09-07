import { Router } from 'express'

import type { Services } from '../services'
import { requireAuthentication } from '../auth/currentUser'
import { getSessionCrn } from '../auth/sessionStore'
import { formatPractitionerName, formatAddress, sanitiseOfficeLocationUrl } from '../utils/utils'

export default function probationOfficerRoutes(services: Services): Router {
  const router = Router()

  router.use(requireAuthentication)

  router.get('/', async (_req, res, next) => {
    try {
      const crn = getSessionCrn(res.locals.user)
      if (!crn) return res.redirect('/autherror')

      const personalDetails = await services.peopleOnProbationService.getPersonalDetails(crn)
      const { practitioner } = personalDetails
      const officeLocationUrl = sanitiseOfficeLocationUrl(practitioner?.officeLocationUrl)
      const officer = practitioner
        ? {
            name: formatPractitionerName(practitioner.name),
            officerPhoneNumber: practitioner.team?.telephoneNumber,
            officePhoneNumber: practitioner.officePhoneNumber,
            officeAddress: formatAddress(practitioner.officeAddress),
            officeLocationUrl: officeLocationUrl && practitioner.officeName ? officeLocationUrl : undefined,
            officeName: officeLocationUrl && practitioner.officeName ? practitioner.officeName : undefined,
          }
        : null

      return res.render('pages/probation-officer', {
        officer:
          officer &&
          (officer.name ||
            officer.officerPhoneNumber ||
            officer.officePhoneNumber ||
            officer.officeAddress.length ||
            officer.officeLocationUrl)
            ? officer
            : null,
      })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
