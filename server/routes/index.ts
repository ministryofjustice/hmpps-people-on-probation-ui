import { Router } from 'express'

import type { Services } from '../services'
import { loadCurrentUser } from '../auth/currentUser'
import type { AppointmentResponse, SentenceResponse } from '../data/peopleOnProbationApiClient'
import { formatDateWithDay, formatTimeRange, formatRemainingDuration } from '../utils/utils'
import appointmentsRoutes from './appointments'
import goalsRoutes from './goals'
import progressRoutes from './progress'
import requirementsRoutes from './requirements'
import probationOfficerRoutes from './probationOfficer'
import detailsRoutes from './details'

type NextAppointmentView = {
  date?: string
  timeRange?: string
}

type MissedAppointmentView = {
  date?: string
}

type OrderProgressView = {
  percentComplete: number
  remainingDuration: string
}

function toNextAppointmentView(appointment?: AppointmentResponse): NextAppointmentView | null {
  if (!appointment) return null

  return {
    date: formatDateWithDay(appointment.date),
    timeRange: formatTimeRange(appointment.startTime, appointment.endTime),
  }
}

function toMissedAppointmentView(appointment?: AppointmentResponse): MissedAppointmentView | null {
  if (!appointment) return null

  return {
    date: formatDateWithDay(appointment.date),
  }
}

function toOrderProgressView(sentences: SentenceResponse[]): OrderProgressView | null {
  const sentence = sentences[0]
  if (!sentence?.startDate || !sentence?.expectedEndDate) return null

  const start = new Date(sentence.startDate)
  const end = new Date(sentence.expectedEndDate)
  const today = new Date()

  const totalDays = Math.max(Math.round((end.getTime() - start.getTime()) / 86_400_000), 1)
  const completedDays = Math.min(Math.max(Math.round((today.getTime() - start.getTime()) / 86_400_000), 0), totalDays)
  const percentComplete = Math.round((completedDays / totalDays) * 100)

  return {
    percentComplete,
    remainingDuration: formatRemainingDuration(sentence.expectedEndDate),
  }
}

export default function routes(services: Services): Router {
  const router = Router()

  router.use(loadCurrentUser)

  router.use('/appointments', appointmentsRoutes(services))
  router.use('/goals', goalsRoutes(services))
  router.use('/progress', progressRoutes(services))
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

        const nextAppointment =
          futureAppointments.content.find(appointment => appointment.nationalStandards === true) ?? undefined

        const missedAppointment =
          pastAppointments.content.find(
            appointment => appointment.nationalStandards === true && appointment.attended === false,
          ) ?? undefined

        return res.render('pages/index', {
          nextAppointment: toNextAppointmentView(nextAppointment),
          missedAppointment: toMissedAppointmentView(missedAppointment),
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
