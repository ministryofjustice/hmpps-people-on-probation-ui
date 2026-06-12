import { Router } from 'express'
import { startOfDay, differenceInDays } from 'date-fns'

import type { Services } from '../services'
import { loadCurrentUser } from '../auth/currentUser'
import type { AppointmentResponse, SentenceResponse } from '../data/peopleOnProbationApiClient'
import {
  formatDateWithDay,
  formatTimeRange,
  formatIntervalDuration,
  formatRemainingDuration,
  parseLocalDate,
} from '../utils/utils'
import appointmentsRoutes from './appointments'
import goalsRoutes from './goals'
import requirementsRoutes from './requirements'
import probationOfficerRoutes from './probationOfficer'
import detailsRoutes from './details'

type NextAppointmentView = {
  date?: string
  timeRange?: string
  variant: 'mandatory-appointment' | 'appointment' | 'activity'
}

type MissedAppointmentView = {
  date?: string
  timeRange?: string
}

type OrderProgressView = {
  percentComplete: number
  completedDuration: string
  remainingDuration: string
}

function toNextAppointmentView(appointment?: AppointmentResponse): NextAppointmentView | null {
  if (!appointment) return null

  let variant: NextAppointmentView['variant'] = 'appointment'
  if (appointment.nationalStandards) variant = 'mandatory-appointment'
  if (appointment.unpaidWork) variant = 'activity'

  return {
    date: formatDateWithDay(appointment.date),
    timeRange: formatTimeRange(appointment.startTime, appointment.endTime),
    variant,
  }
}

function toMissedAppointmentView(appointment?: AppointmentResponse): MissedAppointmentView | null {
  if (!appointment) return null

  return {
    date: formatDateWithDay(appointment.date),
    timeRange: formatTimeRange(appointment.startTime, appointment.endTime),
  }
}

function isMissedMandatoryAppointmentOrActivity(appointment: AppointmentResponse): boolean {
  return appointment.attended === false && (appointment.nationalStandards === true || Boolean(appointment.unpaidWork))
}

function toOrderProgressView(sentences: SentenceResponse[]): OrderProgressView | null {
  const sentence = sentences[0]
  if (!sentence?.startDate || !sentence?.expectedEndDate) return null

  const start = parseLocalDate(sentence.startDate)
  const end = parseLocalDate(sentence.expectedEndDate)
  const today = startOfDay(new Date())

  const totalDays = Math.max(differenceInDays(end, start) + 1, 1)
  const completedDays = Math.min(Math.max(differenceInDays(today, start), 0), totalDays)
  const percentComplete = Math.round((completedDays / totalDays) * 100)

  return {
    percentComplete,
    completedDuration: formatIntervalDuration(start, today),
    remainingDuration: formatRemainingDuration(sentence.expectedEndDate),
  }
}

export default function routes(services: Services): Router {
  const router = Router()

  router.use(loadCurrentUser)

  router.use('/appointments', appointmentsRoutes(services))
  router.use('/goals', goalsRoutes(services))
  router.use('/requirements', requirementsRoutes(services))
  router.use('/probation-officer', probationOfficerRoutes(services))
  router.use('/details', detailsRoutes(services))

  router.get('/', async (req, res, next) => {
    try {
      if (res.locals.user) {
        const crn = res.locals.user.registeredUserDetails?.personReference

        if (!crn) {
          return res.redirect('/autherror')
        }

        const [futureAppointments, pastAppointments, sentenceProgress] = await Promise.all([
          services.peopleOnProbationService.getFutureAppointments(crn, 0, 10),
          services.peopleOnProbationService.getPastAppointments(crn, 0, 10),
          services.peopleOnProbationService.getSentences(crn),
        ])

        const nextAppointment = futureAppointments.content[0] ?? undefined

        const missedAppointments = pastAppointments.content.filter(isMissedMandatoryAppointmentOrActivity)

        return res.render('pages/index', {
          nextAppointment: toNextAppointmentView(nextAppointment),
          missedAppointment: toMissedAppointmentView(missedAppointments[0]),
          missedAppointmentsCount: missedAppointments.length,
          orderProgress: toOrderProgressView(sentenceProgress.sentences),
        })
      }

      if (res.locals.sessionTimedOut) {
        return res.redirect('/session-timeout')
      }

      const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : null
      const token = typeof req.query.token === 'string' ? req.query.token : null
      const signInStartParams = new URLSearchParams()

      if (returnTo) signInStartParams.set('returnTo', returnTo)
      if (token) signInStartParams.set('token', token)

      const signInStartUrl = `/sign-in/start${signInStartParams.size ? `?${signInStartParams.toString()}` : ''}`
      return res.render('pages/start', { signInStartUrl })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
