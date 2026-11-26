import { Router } from 'express'
import type { SanitisedError } from '@ministryofjustice/hmpps-rest-client'

import type { Services } from '../services'
import logger from '../../logger'
import { requireAuthentication } from '../auth/currentUser'
import { getSessionCrn } from '../auth/sessionStore'
import { calculateDateProgress, formatSentenceType, formatUnit, isLicenceSentence } from '../utils/utils'
import { combineSentences, findLicence, groupOrders } from '../utils/concurrentOrders'
import type { AppointmentResponse, SentencePlanResponse, SentenceResponse } from '../data/peopleOnProbationApiClient'
import { type RequirementKind, toRequirementViews } from './requirements'
import findCurrentLicence from '../utils/currentLicence'

type ProgressIcon = { src: string; width: number; height: number }

export type ProgressRow = {
  icon: ProgressIcon
  text: string
  linkText: string
  href: string
  trackingId: string
}

type LicenceProgressView = {
  percentComplete: number
  remainingDuration: string
}

type CurrentLicence = Awaited<ReturnType<typeof findCurrentLicence>>

type OrderProgressView = {
  type?: string
  percentComplete: number
  completedDuration: string
  remainingDuration: string
}

// Someone on licence sees the time until their licence ends: from their release (CVL's licence start date)
// to the licence expiry date (from Prisoner Search), not the sentence's dates from nDelius, which include
// the time in custody. Without both dates, or for an indeterminate sentence (such as life), which never
// ends, there's nothing to show.
export const toLicenceProgressView = (licence?: CurrentLicence): LicenceProgressView | undefined => {
  if (!licence?.licenceStartDate || !licence.licenceExpiryDate || licence.indeterminateSentence) return undefined

  const { percentComplete, remainingDuration } = calculateDateProgress(
    licence.licenceStartDate,
    licence.licenceExpiryDate,
  )
  return { percentComplete, remainingDuration }
}

// Someone on an order sees how far through it they are; without both dates there's nothing to show.
export const toOrderProgressView = (sentence?: SentenceResponse): OrderProgressView | undefined => {
  if (isLicenceSentence(sentence) || !sentence?.startDate || !sentence?.expectedEndDate) return undefined

  const { percentComplete, completedDuration, remainingDuration } = calculateDateProgress(
    sentence.startDate,
    sentence.expectedEndDate,
  )
  return { type: formatSentenceType(sentence.type), percentComplete, completedDuration, remainingDuration }
}

// One progress bar per order to show: matching orders share one (see groupOrders). Orders without
// both dates have no bar.
export const toOrderProgressViews = (sentences: SentenceResponse[] = []): OrderProgressView[] =>
  groupOrders(sentences)
    .map(order => toOrderProgressView(order))
    .filter((view): view is OrderProgressView => view !== undefined)

const ICONS = {
  appointments: { src: '/assets/images/progress-calendar.svg', width: 34, height: 33 },
  unpaidWork: { src: '/assets/images/progress-hi-vis-vest.svg', width: 33, height: 37 },
  goals: { src: '/assets/images/progress-target.svg', width: 36, height: 36 },
  rar: { src: '/assets/images/progress-group.svg', width: 35, height: 24 },
} satisfies Record<string, ProgressIcon>

// Unpaid work appointments are counted as hours in their own row, not as probation appointments.
export const countAttendedAppointments = (appointments: AppointmentResponse[]): number =>
  appointments.filter(appointment => appointment.attended === true && !appointment.unpaidWork).length

type RequirementProgress = { completed: number; unit?: string; href: string }

// Totals the completed units across every requirement of a kind (someone can have more than one
// unpaid work requirement). Uses each requirement view's completed value, which is capped at the
// required amount, so the total matches the requirement detail pages the row links to.
// Undefined when they have none, so the row isn't shown.
export const requirementProgress = (
  sentence: SentenceResponse | undefined,
  kind: RequirementKind,
): RequirementProgress | undefined => {
  const matching = toRequirementViews(sentence?.requirements).filter(view => view.kind === kind)
  if (!matching.length) return undefined

  return {
    completed: matching.reduce((sum, view) => sum + (view.completed ?? 0), 0),
    // Requirements of the same kind share a unit (hours for unpaid work, days for RAR).
    unit: matching.find(view => view.unit)?.unit,
    href: matching.length === 1 ? `/your-probation/${matching[0].slug}` : '/your-probation',
  }
}

export const countAchievedGoals = (plan: SentencePlanResponse | undefined): number =>
  (plan?.goals ?? []).filter(goal => goal.goalStatus === 'ACHIEVED').length

const isNotFound = (error: unknown) => (error as SanitisedError | undefined)?.responseStatus === 404

export default function progressRoutes(services: Services): Router {
  const router = Router()

  router.use(requireAuthentication)

  router.get('/', async (req, res, next) => {
    try {
      const crn = getSessionCrn(res.locals.user)
      if (!crn) return res.redirect('/autherror')

      const { peopleOnProbationService } = services
      // Each row has its own source, so one failing API only hides its own rows.
      const [appointments, sentences, plan] = await Promise.allSettled([
        peopleOnProbationService.getAllPastAppointments(crn),
        peopleOnProbationService.getSentences(crn),
        peopleOnProbationService.getSentencePlan(crn).catch((error): SentencePlanResponse | undefined => {
          // No sentence plan yet: no goals achieved, rather than a failure.
          if (isNotFound(error)) return undefined
          throw error
        }),
      ])

      const failures = [appointments, sentences, plan].filter(result => result.status === 'rejected')
      failures.forEach(failure =>
        logger.warn({ correlationId: req.id, err: failure.reason }, 'Could not load part of the progress page'),
      )
      if (failures.length === 3) throw failures[0].reason

      const rows: ProgressRow[] = []

      if (appointments.status === 'fulfilled') {
        const attended = countAttendedAppointments(appointments.value)
        rows.push({
          icon: ICONS.appointments,
          text: `You have attended ${attended}`,
          linkText: attended === 1 ? 'probation appointment' : 'probation appointments',
          href: '/appointments?tab=past',
          trackingId: 'progress_appointments_link',
        })
      }

      const allSentences = sentences.status === 'fulfilled' ? sentences.value.sentences : []
      const sentence = combineSentences(allSentences)
      const { licence } = findLicence(allSentences)

      const unpaidWork = requirementProgress(sentence, 'unpaid-work')
      if (unpaidWork) {
        rows.push({
          icon: ICONS.unpaidWork,
          text: `You have completed ${unpaidWork.completed} ${formatUnit(unpaidWork.unit, unpaidWork.completed)} of`,
          linkText: 'community payback (unpaid work)',
          href: unpaidWork.href,
          trackingId: 'progress_unpaid_work_link',
        })
      }

      if (plan.status === 'fulfilled') {
        const achieved = countAchievedGoals(plan.value)
        rows.push({
          icon: ICONS.goals,
          text: `You have achieved ${achieved}`,
          linkText: achieved === 1 ? 'goal' : 'goals',
          href: '/goals?tab=achieved',
          trackingId: 'progress_goals_link',
        })
      }

      const rar = requirementProgress(sentence, 'rar')
      if (rar) {
        rows.push({
          icon: ICONS.rar,
          text: `You have completed ${rar.completed}`,
          linkText: `RAR ${formatUnit(rar.unit, rar.completed)}`,
          href: rar.href,
          trackingId: 'progress_rar_link',
        })
      }

      // The time until the licence ends comes from the licence's own dates, so if the licence can't be
      // loaded it isn't shown.
      const currentLicence =
        licence &&
        (await findCurrentLicence(services, crn).catch((error): undefined => {
          logger.warn({ correlationId: req.id, err: error }, 'Could not load the licence for the progress page')
          return undefined
        }))

      return res.render('pages/progress', {
        rows,
        // Someone on licence and an order sees both: the licence first, then the order.
        licenceProgress: toLicenceProgressView(currentLicence),
        orderProgress: toOrderProgressViews(allSentences.filter(s => s !== licence)),
      })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
