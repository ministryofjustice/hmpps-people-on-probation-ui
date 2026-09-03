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
  formatSentenceType,
  formatUnit,
  parseLocalDate,
} from '../utils/utils'
import type { RequirementResponse } from '../data/peopleOnProbationApiClient'
import {
  GPS_TAG_CATEGORY_CODE,
  CURFEW_CATEGORY_CODE,
  UNPAID_WORK_CATEGORY_CODE,
  RAR_CATEGORY_CODE,
  TAG_CATEGORY_CODES,
} from '../utils/categoryCodes'

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

export type RequirementKind = 'unpaid-work' | 'rar' | 'gps-tag' | 'curfew' | 'other'

export type RequirementView = {
  label: string
  slug: string
  kind: RequirementKind
  isTag: boolean
  percentComplete: number
  completedDuration?: string
  required?: number
  completed?: number
  remaining?: number
  remainingUnitLabel?: string
  startDate?: string
  endDate?: string
  totalLength?: string
  remainingDuration?: string
  lastUpdatedAt?: string
}

export function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const REQUIREMENT_KIND_LABELS: Record<Exclude<RequirementKind, 'other'>, string> = {
  'unpaid-work': 'Community payback (unpaid work)',
  rar: 'Rehabilitation Activity Requirement (RAR)',
  'gps-tag': 'GPS tag',
  curfew: 'Curfew',
}

function classifyRequirement(requirement: RequirementResponse): RequirementKind {
  switch (requirement.mainCategory?.code) {
    case UNPAID_WORK_CATEGORY_CODE:
      return 'unpaid-work'
    case RAR_CATEGORY_CODE:
      return 'rar'
    case GPS_TAG_CATEGORY_CODE:
      return 'gps-tag'
    case CURFEW_CATEGORY_CODE:
      return 'curfew'
    default:
      return 'other'
  }
}

export function toRequirementView(requirement: RequirementResponse): RequirementView | null {
  const kind = classifyRequirement(requirement)
  const defaultLabel = requirement.mainCategory?.description || requirement.subCategory?.description || 'Requirement'
  const label = kind === 'other' ? defaultLabel : REQUIREMENT_KIND_LABELS[kind]
  const slug = slugify(label)
  const isTag = TAG_CATEGORY_CODES.includes(requirement.mainCategory?.code)
  const lastUpdatedAt = formatDateTimeWithDay(requirement.lastUpdatedAt)

  const startDate = requirement.actualStartDate ?? requirement.expectedStartDate
  const endDate = requirement.expectedEndDate ?? requirement.actualEndDate

  if (requirement.required && requirement.required > 0) {
    const completed = Math.min(requirement.completed ?? 0, requirement.required)
    const remaining = Math.max(requirement.required - completed, 0)
    const percentComplete = Math.round((completed / requirement.required) * 100)
    const remainingUnitLabel = formatUnit(requirement.unit, remaining)
    const completedLabel = formatUnit(requirement.unit, completed)
    const totalUnitLabel = formatUnit(requirement.unit, requirement.required)
    return {
      label,
      slug,
      kind,
      isTag,
      required: requirement.required,
      completed,
      remaining,
      remainingUnitLabel,
      percentComplete,
      completedDuration: `${completed} ${completedLabel}`,
      startDate: formatDate(startDate) ?? startDate,
      endDate: formatDate(endDate) ?? endDate,
      totalLength: `${requirement.required} ${totalUnitLabel}`,
      lastUpdatedAt,
    }
  }

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
      slug,
      kind,
      isTag,
      percentComplete,
      completedDuration,
      totalLength,
      remainingDuration,
      startDate: fmtStart,
      endDate: fmtEnd,
      lastUpdatedAt,
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
          type: formatSentenceType(sentence?.type),
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

  router.get('/:slug', async (req, res, next) => {
    try {
      const crn = getSessionCrn(res.locals.user)
      if (!crn) return res.redirect('/autherror')

      const sentenceProgress = await services.peopleOnProbationService.getSentences(crn)
      const sentence = sentenceProgress.sentences[0]

      const requirement = (sentence?.requirements ?? [])
        .map(toRequirementView)
        .filter((r): r is RequirementView => r !== null)
        .find(r => r.slug === req.params.slug)

      if (!requirement) return next()

      return res.render('pages/requirement-detail', { requirement })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
