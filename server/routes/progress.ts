import { Router } from 'express'
import type { SanitisedError } from '@ministryofjustice/hmpps-rest-client'

import type { Services } from '../services'
import logger from '../../logger'
import { requireAuthentication } from '../auth/currentUser'
import { getSessionCrn } from '../auth/sessionStore'
import { formatUnit } from '../utils/utils'
import type { AppointmentResponse, SentencePlanResponse, SentenceResponse } from '../data/peopleOnProbationApiClient'
import { type RequirementKind, toRequirementViews } from './requirements'

type ProgressIcon = { src: string; width: number; height: number }

export type ProgressRow = {
  icon: ProgressIcon
  text: string
  linkText: string
  href: string
  trackingId: string
}

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
    href: matching.length === 1 ? `/requirements/${matching[0].slug}` : '/requirements',
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

      const sentence = sentences.status === 'fulfilled' ? sentences.value.sentences[0] : undefined

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

      return res.render('pages/progress', { rows })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
