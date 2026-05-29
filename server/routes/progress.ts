import { Router } from 'express'

import type { Services } from '../services'
import { requireAuthentication } from '../auth/currentUser'
import { formatDate, formatDateTime, formatRemainingDuration, formatUnit } from '../utils/utils'
import type { RequirementResponse } from '../data/peopleOnProbationApiClient'

type DateProgressResult = {
  percentComplete: number
  remainingDuration: string
  startDate: string
  endDate: string
}

function calculateDateProgress(startDateStr: string, endDateStr: string): DateProgressResult {
  const start = new Date(startDateStr)
  const end = new Date(endDateStr)
  const today = new Date()
  const totalDays = Math.max(Math.round((end.getTime() - start.getTime()) / 86_400_000), 1)
  const completedDays = Math.min(Math.max(Math.round((today.getTime() - start.getTime()) / 86_400_000), 0), totalDays)
  return {
    percentComplete: Math.round((completedDays / totalDays) * 100),
    remainingDuration: formatRemainingDuration(endDateStr),
    startDate: formatDate(startDateStr) ?? startDateStr,
    endDate: formatDate(endDateStr) ?? endDateStr,
  }
}

type OverallOrderView = {
  type?: string
  startDate?: string
  endDate?: string
  remainingDuration: string
  percentComplete: number
}

type RequirementView = {
  label: string
  percentComplete: number
  // Count-based (required/completed available)
  required?: number
  completed?: number
  remaining?: number
  unitLabel?: string
  // Date-based (actualStartDate/actualEndDate available)
  startDate?: string
  endDate?: string
  remainingDuration?: string
}

function toRequirementView(requirement: RequirementResponse): RequirementView | null {
  const label = requirement.type || requirement.description || 'Requirement'

  if (requirement.required && requirement.required > 0) {
    const completed = Math.min(requirement.completed ?? 0, requirement.required)
    const remaining = Math.max(requirement.required - completed, 0)
    const percentComplete = Math.round((completed / requirement.required) * 100)
    const unitLabel = formatUnit(requirement.unit, remaining)
    return { label, required: requirement.required, completed, remaining, unitLabel, percentComplete }
  }

  const startDate = requirement.actualStartDate ?? requirement.expectedStartDate
  const endDate = requirement.expectedEndDate ?? requirement.actualEndDate
  if (startDate && endDate) {
    const {
      percentComplete,
      remainingDuration,
      startDate: fmtStart,
      endDate: fmtEnd,
    } = calculateDateProgress(startDate, endDate)
    return { label, percentComplete, remainingDuration, startDate: fmtStart, endDate: fmtEnd }
  }

  return null
}

export default function progressRoutes(services: Services): Router {
  const router = Router()

  router.use(requireAuthentication)

  router.get('/', async (_req, res, next) => {
    try {
      const crn = res.locals.user?.registeredUserDetails?.personReference
      if (!crn) return res.redirect('/autherror')

      const sentenceProgress = await services.peopleOnProbationService.getSentences(crn)
      const sentence = sentenceProgress.sentences[0]

      let overallOrder: OverallOrderView | null = null
      if (sentence?.startDate && sentence?.expectedEndDate) {
        const { percentComplete, remainingDuration, startDate, endDate } = calculateDateProgress(
          sentence.startDate,
          sentence.expectedEndDate,
        )
        overallOrder = { type: sentence.type, startDate, endDate, remainingDuration, percentComplete }
      }

      const requirements = (sentence?.requirements ?? [])
        .map(toRequirementView)
        .filter((r): r is RequirementView => r !== null)

      return res.render('pages/progress', {
        overallOrder,
        requirements,
        lastUpdatedAt: formatDateTime(sentence?.lastUpdatedAt),
      })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
