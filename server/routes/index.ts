import { Router, type Response, type NextFunction } from 'express'
import { startOfDay, differenceInDays, isBefore, addDays } from 'date-fns'

import logger from '../../logger'
import config, { chatbotEnabled } from '../config'
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
  APPOINTMENTS_OVERVIEW_SIZE,
} from '../utils/utils'
import appointmentsRoutes from './appointments'
import goalsRoutes from './goals'
import requirementsRoutes from './requirements'
import probationOfficerRoutes from './probationOfficer'
import detailsRoutes from './details'
import chatbotRoutes from './chatbot'
import expectationsRoutes from './expectations'
import feedbackRoutes from './feedback'
import adminRoutes from './admin'
import documentsRoutes from './documents'
import adminDocumentsRoutes from './adminDocuments'
import setUpAdminAuthentication from '../middleware/setUpAdminAuthentication'

// Max time to wait on the cosmetic "Hi, {name}" record lookup before rendering
// /chat with the widget's default greeting instead (see the /chat handler).
const GREETING_NAME_TIMEOUT_MS = 1500

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
  router.use('/probation-agreement', expectationsRoutes(services))
  router.use('/feedback', feedbackRoutes(services))

  if (config.features.documents) {
    router.use('/documents', documentsRoutes(services))
  }

  // Admin "preview as user" feature — independent HMPPS Auth identity
  // (res.locals.adminUser), fully separate from the citizen One Login
  // session above (res.locals.user). See server/middleware/
  // setUpAdminAuthentication.ts and server/routes/admin.ts.
  if (config.features.adminPreview) {
    router.use('/admin', setUpAdminAuthentication(services), adminRoutes(services))
    // setUpAdminAuthentication is already mounted for the whole /admin/* prefix above - it
    // doesn't need mounting again here, and doing so would register a second, unreachable set
    // of sign-in/callback/sign-out routes under /admin/documents (the OAuth callbackURL is
    // fixed to /admin/sign-in/callback) and re-run passport.initialize()/session() for nothing.
    if (config.features.documents) {
      router.use('/admin/documents', adminDocumentsRoutes(services))
    }
  }

  // The signed-in account dashboard. Shared by /home and by / (when the chatbot
  // is switched off), so the two entry points can never drift apart.
  const renderAccountHome = async (res: Response, next: NextFunction) => {
    try {
      const crn = getSessionCrn(res.locals.user)

      if (!crn) {
        return res.redirect('/autherror')
      }

      const [futureAppointments, pastAppointments, sentenceProgress] = await Promise.all([
        services.peopleOnProbationService.getFutureAppointments(crn, 0, APPOINTMENTS_OVERVIEW_SIZE),
        services.peopleOnProbationService.getPastAppointments(crn, 0, APPOINTMENTS_OVERVIEW_SIZE),
        services.peopleOnProbationService.getSentences(crn),
      ])

      const [nextAppointment] = futureAppointments.content

      const missedAppointments = pastAppointments.content
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
    } catch (error) {
      return next(error)
    }
  }

  // Full-screen chat page and chat-first landing, gated behind `chatbotEnabled`
  // (the flag AND the backend creds — the same check the nav uses, so routes and
  // nav can't disagree). With it off, /chat and /home don't exist and / falls
  // through to the normal account dashboard below — the site behaves as before.
  if (chatbotEnabled) {
    router.get('/chat', requireAuthentication, async (req, res) => {
      // Match the dashboard and every other account page: a signed-in user with
      // no CRN has no probation record, so send them to /autherror rather than
      // let the chat answer record-specific questions with nothing behind them.
      const crn = getSessionCrn(res.locals.user)
      if (!crn) {
        return res.redirect('/autherror')
      }
      // Greeting name for the "Hi, {name}" home screen: prefer the One Login
      // display name; if it's blank (not every user has a verified name claim),
      // fall back to the forename on the probation record. Display-only — this
      // does NOT change anything sent to the chatbot.
      let greetingName = (res.locals.user.displayName || '').trim().split(' ')[0]
      if (!greetingName) {
        // This lookup is purely cosmetic and sits on the landing path (/ redirects
        // here), so bound it hard: no retries and a short timeout. If the POP API
        // is slow or down, don't stall the page — just render the widget's default
        // greeting (what it would have shown anyway).
        try {
          const name = await Promise.race([
            services.peopleOnProbationService.getName(crn, { retries: 0 }),
            new Promise<null>(resolve => {
              setTimeout(() => resolve(null), GREETING_NAME_TIMEOUT_MS)
            }),
          ])
          greetingName = (name?.forename || '').trim()
        } catch {
          // Non-fatal — fall back to the widget's default greeting.
        }
      }
      return res.render('pages/chat', { greetingName })
    })
    router.get('/home', requireAuthentication, (req, res, next) => renderAccountHome(res, next))
  }

  router.get('/', async (req, res, next) => {
    try {
      if (res.locals.user) {
        // Chat-first landing: signed-in users go straight to the chat when the
        // chatbot is enabled; otherwise they see the account dashboard.
        if (chatbotEnabled) {
          return res.redirect('/chat')
        }
        return renderAccountHome(res, next)
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
