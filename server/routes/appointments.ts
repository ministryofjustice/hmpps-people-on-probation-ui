import { Router } from 'express'

import type { Services } from '../services'
import { requireAuthentication } from '../auth/currentUser'
import { formatDateWithDay, formatTimeRange, formatAddress, formatPersonName, formatDateTime } from '../utils/utils'
import type { AppointmentResponse } from '../data/peopleOnProbationApiClient'

type AppointmentCardView = {
  date?: string
  timeRange?: string
  type?: string
  description?: string
  nationalStandards?: boolean
  address: string[]
  practitionerName?: string
  attended?: boolean
  outcome?: string
}

type MissedAlertView = {
  date?: string
  timeRange?: string
  description?: string
  type?: string
  practitionerName?: string
}

function toAppointmentCardView(appointment: AppointmentResponse): AppointmentCardView {
  return {
    date: formatDateWithDay(appointment.date),
    timeRange: formatTimeRange(appointment.startTime, appointment.endTime),
    type: appointment.type,
    description: appointment.description,
    nationalStandards: appointment.nationalStandards,
    address: formatAddress(appointment.location),
    practitionerName: formatPersonName(appointment.practitioner?.name),
    attended: appointment.attended,
    outcome: appointment.outcome,
  }
}

export default function appointmentsRoutes(services: Services): Router {
  const router = Router()

  router.use(requireAuthentication)

  router.get('/', async (req, res, next) => {
    try {
      const crn = res.locals.user?.registeredUserDetails?.personReference
      if (!crn) return res.redirect('/autherror')

      const [futureAppointments, pastAppointments] = await Promise.all([
        services.peopleOnProbationService.getFutureAppointments(crn, 0, 10),
        services.peopleOnProbationService.getPastAppointments(crn, 0, 10),
      ])

      const missedPassedAppointment = pastAppointments.content.find(a => a.nationalStandards === true && a.attended === false)

      const missedAlert: MissedAlertView | null = missedPassedAppointment
        ? {
            date: formatDateWithDay(missedPassedAppointment.date),
            timeRange: formatTimeRange(missedPassedAppointment.startTime, missedPassedAppointment.endTime),
            description: missedPassedAppointment.description,
            type: missedPassedAppointment.type,
            practitionerName: formatPersonName(missedPassedAppointment.practitioner?.name),
          }
        : null

      const allAppointments = [...futureAppointments.content, ...pastAppointments.content]
      const mostRecentUpdate = allAppointments
        .map(a => a.lastUpdatedAt)
        .filter(Boolean)
        .sort()
        .reverse()[0]

      return res.render('pages/appointments', {
        missedAlert,
        lastUpdatedAt: formatDateTime(mostRecentUpdate),
        futureAppointments: futureAppointments.content.map(toAppointmentCardView),
        pastAppointments: pastAppointments.content.map(toAppointmentCardView),
      })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
