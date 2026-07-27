import { Router } from 'express'
import { startOfDay, differenceInDays, isBefore, addDays } from 'date-fns'

import logger from '../../logger'
import config from '../config'
import type { Services } from '../services'
import { loadCurrentUser, requireAuthentication } from '../auth/currentUser'
import normaliseReturnTo from '../auth/returnTo'
import { getSessionCrn } from '../auth/sessionStore'
import type { AppointmentResponse, SentenceResponse } from '../data/peopleOnProbationApiClient'
import {
  formatDateWithDay,
  formatTimeRange,
  formatIntervalDuration,
  formatRemainingDuration,
  isMissedMandatoryAppointmentOrActivity,
  shouldIncludeMissedAppointmentInAlert,
  parseLocalDate,
} from '../utils/utils'
import appointmentsRoutes, { shouldShowAppointment } from './appointments'
import goalsRoutes from './goals'
import requirementsRoutes from './requirements'
import probationOfficerRoutes from './probationOfficer'
import detailsRoutes from './details'
import chatbotRoutes from './chatbot'
import expectationsRoutes from './expectations'
import feedbackRoutes from './feedback'
import adminRoutes from './admin'
import setUpAdminAuthentication from '../middleware/setUpAdminAuthentication'

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
    timeRange: appointment.unpaidWork ? undefined : formatTimeRange(appointment.startTime, appointment.endTime),
    variant,
  }
}

function toMissedAppointmentView(appointment?: AppointmentResponse): MissedAppointmentView | null {
  if (!appointment) return null

  return {
    date: formatDateWithDay(appointment.date),
    timeRange: appointment.unpaidWork ? undefined : formatTimeRange(appointment.startTime, appointment.endTime),
  }
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
  const effectiveToday = isBefore(today, end) ? today : addDays(end, 1)

  return {
    percentComplete,
    completedDuration: formatIntervalDuration(start, effectiveToday),
    remainingDuration: formatRemainingDuration(sentence.expectedEndDate),
  }
}

export default function routes(services: Services): Router {
  const router = Router()

  router.use(loadCurrentUser)

  router.get('/welcome', requireAuthentication, (req, res) => {
    const lastSignedInAt = res.locals.user?.registeredUserDetails?.lastSignedInAt
    const returnTo = normaliseReturnTo(typeof req.query.returnTo === 'string' ? req.query.returnTo : '/')
    const firstVisit = req.query.firstVisit === 'true'

    const daysSinceLastSignIn = lastSignedInAt ? differenceInDays(new Date(), new Date(lastSignedInAt)) : null
    const shouldShowInterstitial = firstVisit || !lastSignedInAt || (daysSinceLastSignIn ?? 0) >= 30

    logger.info(
      { lastSignedInAt, daysSinceLastSignIn, firstVisit, shouldShowInterstitial, returnTo },
      '[welcome] interstitial decision',
    )

    if (!shouldShowInterstitial) {
      logger.info({ returnTo }, '[welcome] skipping interstitial, redirecting')
      return res.redirect(returnTo)
    }

    logger.info('[welcome] rendering welcome page')
    return res.render('pages/welcome', { returnTo })
  })

  router.use('/appointments', appointmentsRoutes(services))
  router.use('/goals', goalsRoutes(services))
  router.use('/requirements', requirementsRoutes(services))
  router.use('/probation-officer', probationOfficerRoutes(services))
  router.use('/details', detailsRoutes(services))
  router.use('/api/chatbot', chatbotRoutes(services))
  router.use('/expectations', expectationsRoutes(services))
  router.use('/feedback', feedbackRoutes(services))

  // Admin "preview as user" feature — independent HMPPS Auth identity
  // (res.locals.adminUser), fully separate from the citizen One Login
  // session above (res.locals.user). See server/middleware/
  // setUpAdminAuthentication.ts and server/routes/admin.ts.
  if (config.features.adminPreview) {
    router.use('/admin', setUpAdminAuthentication(services), adminRoutes(services))
  }

  router.get('/', async (req, res, next) => {
    try {
      if (res.locals.user) {
        const crn = getSessionCrn(res.locals.user)

        if (!crn) {
          return res.redirect('/autherror')
        }

        const [futureAppointments, pastAppointments, sentenceProgress] = await Promise.all([
          services.peopleOnProbationService.getFutureAppointments(crn, 0, 50),
          services.peopleOnProbationService.getPastAppointments(crn, 0, 50),
          services.peopleOnProbationService.getSentences(crn),
        ])

        const nextAppointment = futureAppointments.content.find(shouldShowAppointment)

        const missedAppointments = pastAppointments.content
          .filter(shouldShowAppointment)
          .filter(isMissedMandatoryAppointmentOrActivity)
          .filter(appointment =>
            shouldIncludeMissedAppointmentInAlert(
              appointment,
              res.locals.user.registeredUserDetails?.createdAt,
              res.locals.user.isRegistrationSession,
            ),
          )
        const missedAlertEnabled = config.features.missedAppointmentAlert

        return res.render('pages/index', {
          nextAppointment: toNextAppointmentView(nextAppointment),
          missedAppointment: missedAlertEnabled ? toMissedAppointmentView(missedAppointments[0]) : null,
          missedAppointmentsCount: missedAlertEnabled ? missedAppointments.length : 0,
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
