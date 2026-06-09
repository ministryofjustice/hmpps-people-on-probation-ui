import { Router } from 'express'
import type { SanitisedError } from '@ministryofjustice/hmpps-rest-client'

import type { Services } from '../services'
import { requireAuthentication } from '../auth/currentUser'
import { formatDate, formatDateTimeWithDay } from '../utils/utils'
import type { GoalResponse, StepResponse } from '../data/peopleOnProbationApiClient'

const ACTOR_LABELS: Record<string, string> = {
  PERSON_ON_PROBATION: 'You',
  PROBATION_PRACTITIONER: 'Probation officer',
  PROGRAMME_STAFF: 'Programme staff',
  PARTNERSHIP_AGENCY: 'Partnership agency',
  CRS_PROVIDER: 'CRS provider',
  PRISON_OFFENDER_MANAGER: 'Prison offender manager',
  SOMEONE_ELSE: 'Someone else',
}

const STEP_STATUS_TAGS: Record<string, { text: string; classes: string }> = {
  COMPLETED: { text: 'Completed', classes: 'govuk-tag--green' },
  IN_PROGRESS: { text: 'In progress', classes: 'govuk-tag--blue' },
  NOT_STARTED: { text: 'Not started', classes: 'govuk-tag--grey' },
  CANNOT_BE_DONE_YET: { text: 'Cannot be done yet', classes: 'govuk-tag--grey' },
  NO_LONGER_NEEDED: { text: 'No longer needed', classes: 'govuk-tag--grey' },
}

type StepView = {
  description: string
  actor: string
  tag: { text: string; classes: string }
}

type GoalView = {
  title: string
  targetDate?: string
  completedSteps: number
  totalSteps: number
  steps: StepView[]
}

function toStepView(step: StepResponse): StepView {
  return {
    description: step.description ?? '',
    actor: ACTOR_LABELS[step.actor ?? ''] ?? step.actor ?? '',
    tag: STEP_STATUS_TAGS[step.status ?? ''] ?? { text: step.status ?? '', classes: '' },
  }
}

function toGoalView(goal: GoalResponse): GoalView {
  const steps = goal.steps.map(toStepView)
  const completedSteps = goal.steps.filter(s => s.status === 'COMPLETED').length
  return {
    title: goal.goalTitle,
    targetDate: formatDate(goal.targetDate),
    completedSteps,
    totalSteps: steps.length,
    steps,
  }
}

const VALID_TABS = ['current', 'future', 'achieved'] as const
type Tab = (typeof VALID_TABS)[number]

export default function goalsRoutes(services: Services): Router {
  const router = Router()

  router.use(requireAuthentication)

  router.get('/', async (req, res, next) => {
    const activeTab: Tab = VALID_TABS.includes(req.query.tab as Tab) ? (req.query.tab as Tab) : 'current'

    try {
      const crn = res.locals.user?.registeredUserDetails?.personReference
      if (!crn) return res.redirect('/autherror')

      const plan = await services.peopleOnProbationService.getSentencePlan(crn)
      const allGoals = plan?.goals ?? []

      const currentGoals = allGoals.filter(g => g.goalStatus === 'ACTIVE').map(toGoalView)
      const futureGoals = allGoals.filter(g => g.goalStatus === 'FUTURE').map(toGoalView)
      const rawAchievedGoals = allGoals.filter(g => g.goalStatus === 'ACHIEVED')
      const achievedGoals = rawAchievedGoals.map(toGoalView)

      const allStepDates = allGoals
        .flatMap(g => g.steps)
        .map(s => s.statusDate)
        .filter(Boolean)
        .sort()

      const lastUpdatedAt = allStepDates.at(-1)

      const achievedAt = rawAchievedGoals
        .flatMap(g => g.steps)
        .map(s => s.statusDate)
        .filter(Boolean)
        .sort()
        .at(-1)

      return res.render('pages/goals', {
        activeTab,
        currentGoals,
        futureGoals,
        achievedGoals,
        lastUpdatedAt: lastUpdatedAt ? formatDateTimeWithDay(lastUpdatedAt) : null,
        achievedAt: achievedAt ? formatDateTimeWithDay(achievedAt) : null,
      })
    } catch (error) {
      if ((error as SanitisedError).responseStatus === 404) {
        return res.render('pages/goals', {
          activeTab,
          currentGoals: [],
          futureGoals: [],
          achievedGoals: [],
          lastUpdatedAt: null,
          achievedAt: null,
        })
      }
      return next(error)
    }
  })

  return router
}
