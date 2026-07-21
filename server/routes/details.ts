import { Router } from 'express'

import type { Services } from '../services'
import { requireAuthentication } from '../auth/currentUser'
import { getSessionCrn } from '../auth/sessionStore'
import { formatDate, formatPersonName, formatAddress } from '../utils/utils'
import type { PersonalContactResponse } from '../data/peopleOnProbationApiClient'

type EmergencyContactView = {
  name?: string
  relationship?: string
  phoneNumber?: string
  emailAddress?: string
}

function toEmergencyContactView(contact: PersonalContactResponse): EmergencyContactView {
  return {
    name: formatPersonName(contact.name),
    relationship: contact.relationship,
    phoneNumber: contact.mobileNumber,
    emailAddress: contact.emailAddress,
  }
}

export default function detailsRoutes(services: Services): Router {
  const router = Router()

  router.use(requireAuthentication)

  router.get('/', async (_req, res, next) => {
    try {
      const crn = getSessionCrn(res.locals.user)
      if (!crn) return res.redirect('/autherror')

      const personalDetails = await services.peopleOnProbationService.getPersonalDetails(crn)

      return res.render('pages/details', {
        personal: {
          name: formatPersonName(personalDetails.name),
          preferredName: personalDetails.preferredName,
          dateOfBirth: formatDate(personalDetails.dateOfBirth),
        },
        contact: {
          address: formatAddress(personalDetails.mainAddress),
          phoneNumber: personalDetails.telephoneNumber,
          mobileNumber: personalDetails.mobileNumber,
          emailAddress: personalDetails.emailAddress,
        },
        emergencyContacts: (personalDetails.emergencyContacts ?? []).map(toEmergencyContactView),
      })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
