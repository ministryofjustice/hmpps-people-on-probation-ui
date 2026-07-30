import { Router } from 'express'

import { startOfDay, addDays, differenceInDays, isBefore } from 'date-fns'
import type { Services } from '../services'
import { requireAuthentication } from '../auth/currentUser'
import { getSessionCrn } from '../auth/sessionStore'
import {
  formatDate,
  formatDateTimeWithDay,
  formatRemainingDuration,
  formatIntervalDuration,
  formatUnit,
  parseLocalDate,
} from '../utils/utils'
import type { RequirementResponse } from '../data/peopleOnProbationApiClient'

type DateProgressResult = {
  percentComplete: number
  completedDuration: string
  totalLength: string
  remainingDuration: string
  startDate: string
  endDate: string
}

function calculateDateProgress(startDateStr: string, endDateStr: string): DateProgressResult {
  const start = parseLocalDate(startDateStr)
  const end = parseLocalDate(endDateStr)
  const today = startOfDay(new Date())
  const totalDays = Math.max(differenceInDays(end, start) + 1, 1)
  const completedDays = Math.min(Math.max(differenceInDays(today, start), 0), totalDays)
  const effectiveToday = isBefore(today, end) ? today : addDays(end, 1)
  return {
    percentComplete: Math.round((completedDays / totalDays) * 100),
    completedDuration: formatIntervalDuration(start, effectiveToday),
    totalLength: formatIntervalDuration(start, addDays(end, 1)),
    remainingDuration: formatRemainingDuration(endDateStr),
    startDate: formatDate(startDateStr) ?? startDateStr,
    endDate: formatDate(endDateStr) ?? endDateStr,
  }
}

type OverallOrderView = {
  charge?: string
  type?: string
  startDate?: string
  endDate?: string
  totalLength?: string
  completedDuration: string
  remainingDuration: string
  percentComplete: number
}

export type RequirementView = {
  label: string
  isRAR: boolean
  isUnpaidWork: boolean
  percentComplete: number
  completedDuration?: string
  required?: number
  completed?: number
  remaining?: number
  unitLabel?: string
  startDate?: string
  endDate?: string
  totalLength?: string
  remainingDuration?: string
}

export function toRequirementView(requirement: RequirementResponse): RequirementView | null {
  const isUnpaidWork = requirement.mainCategory?.code === 'W'
  const label = isUnpaidWork
    ? 'Community payback'
    : requirement.mainCategory?.description || requirement.subCategory?.description || 'Requirement'
  const isRAR = requirement.mainCategory?.code === 'F'

  if (requirement.required && requirement.required > 0) {
    const completed = Math.min(requirement.completed ?? 0, requirement.required)
    const remaining = Math.max(requirement.required - completed, 0)
    const percentComplete = Math.round((completed / requirement.required) * 100)
    const unitLabel = formatUnit(requirement.unit, remaining)
    const completedLabel = formatUnit(requirement.unit, completed)
    return {
      label,
      isRAR,
      isUnpaidWork,
      required: requirement.required,
      completed,
      remaining,
      unitLabel,
      percentComplete,
      completedDuration: `${completed} ${completedLabel}`,
    }
  }

  const startDate = requirement.actualStartDate ?? requirement.expectedStartDate
  const endDate = requirement.expectedEndDate ?? requirement.actualEndDate
  if (startDate && endDate) {
    const {
      percentComplete,
      completedDuration,
      totalLength,
      remainingDuration,
      startDate: fmtStart,
      endDate: fmtEnd,
    } = calculateDateProgress(startDate, endDate)
    return {
      label,
      isRAR,
      isUnpaidWork,
      percentComplete,
      completedDuration,
      totalLength,
      remainingDuration,
      startDate: fmtStart,
      endDate: fmtEnd,
    }
  }

  return null
}

export default function requirementsRoutes(services: Services): Router {
  const router = Router()

  router.use(requireAuthentication)

  router.get('/', async (_req, res, next) => {
    try {
      const crn = getSessionCrn(res.locals.user)
      if (!crn) return res.redirect('/autherror')

      const sentenceProgress = await services.peopleOnProbationService.getSentences(crn)
      const sentence = sentenceProgress.sentences[0]

      let overallOrder: OverallOrderView | null = null
      if (sentence?.startDate && sentence?.expectedEndDate) {
        const { percentComplete, completedDuration, totalLength, remainingDuration, startDate, endDate } =
          calculateDateProgress(sentence.startDate, sentence.expectedEndDate)
        overallOrder = {
          charge: sentence.mainOffence?.description,
          type: sentence?.type,
          startDate,
          endDate,
          totalLength,
          completedDuration,
          remainingDuration,
          percentComplete,
        }
      }

      const requirements = (sentence?.requirements ?? [])
        .map(toRequirementView)
        .filter((r): r is RequirementView => r !== null)

      const mostRecentUpdate = (sentence?.requirements ?? [])
        .map(r => r.lastUpdatedAt)
        .filter(Boolean)
        .sort()
        .reverse()[0]

      return res.render('pages/requirements', {
        overallOrder,
        requirements,
        lastUpdatedAt: formatDateTimeWithDay(mostRecentUpdate),
      })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
