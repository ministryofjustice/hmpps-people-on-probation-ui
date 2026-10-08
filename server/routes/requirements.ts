import { Router } from 'express'

import type { Services } from '../services'
import config from '../config'
import { requireAuthentication } from '../auth/currentUser'
import { getSessionCrn } from '../auth/sessionStore'
import {
  calculateDateProgress,
  formatDate,
  formatDateTimeWithDay,
  formatSentenceType,
  formatUnit,
  isLicenceSentence,
} from '../utils/utils'
import type { RequirementResponse } from '../data/peopleOnProbationApiClient'
import { findDocumentIdByType } from '../utils/documentTypes'
import {
  GPS_TAG_CATEGORY_CODE,
  CURFEW_CATEGORY_CODE,
  UNPAID_WORK_CATEGORY_CODE,
  RAR_CATEGORY_CODE,
  PROHIBITED_ACTIVITY_CATEGORY_CODE,
  TAG_CATEGORY_CODES,
} from '../utils/categoryCodes'

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

export type RequirementKind = 'unpaid-work' | 'rar' | 'gps-tag' | 'curfew' | 'prohibited-activity' | 'other'

export type RequirementView = {
  label: string
  slug: string
  kind: RequirementKind
  showCourtOrderSignpost: boolean
  percentComplete?: number
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
  'prohibited-activity': 'Prohibited Activity',
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
    case PROHIBITED_ACTIVITY_CATEGORY_CODE:
      return 'prohibited-activity'
    default:
      return 'other'
  }
}

export function toRequirementView(requirement: RequirementResponse): RequirementView {
  const kind = classifyRequirement(requirement)
  const defaultLabel = requirement.mainCategory?.description || requirement.subCategory?.description || 'Requirement'
  const label = kind === 'other' ? defaultLabel : REQUIREMENT_KIND_LABELS[kind]
  const slug = slugify(label)
  const showCourtOrderSignpost =
    TAG_CATEGORY_CODES.includes(requirement.mainCategory?.code) || kind === 'prohibited-activity'
  const lastUpdatedAt = formatDateTimeWithDay(requirement.lastUpdatedAt)

  const startDate = requirement.actualStartDate ?? requirement.expectedStartDate ?? requirement.imposedDate
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
      showCourtOrderSignpost,
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
      showCourtOrderSignpost,
      percentComplete,
      completedDuration,
      totalLength,
      remainingDuration,
      startDate: fmtStart,
      endDate: fmtEnd,
      lastUpdatedAt,
    }
  }

  // No count and no end date (e.g. accredited programmes): nothing to measure progress against.
  return {
    label,
    slug,
    kind,
    showCourtOrderSignpost,
    startDate: formatDate(startDate) ?? startDate,
    endDate: formatDate(endDate) ?? endDate,
    lastUpdatedAt,
  }
}

// Requirements sharing a label (e.g. Unpaid Work "Regular" and "Additional Hours") get the
// sub-category appended so each has its own card and detail page.
export function toRequirementViews(requirements: RequirementResponse[] = []): RequirementView[] {
  const views = requirements.map(toRequirementView)
  const labelCounts = views.reduce<Record<string, number>>(
    (counts, view) => ({ ...counts, [view.label]: (counts[view.label] ?? 0) + 1 }),
    {},
  )
  const usedSlugs = new Set<string>()

  return views.map((view, index) => {
    let { label } = view
    const subCategory = requirements[index].subCategory?.description
    if (labelCounts[view.label] > 1 && subCategory && subCategory !== view.label) {
      label = `${view.label} – ${subCategory}`
    }
    let slug = slugify(label)
    for (let n = 2; usedSlugs.has(slug); n += 1) slug = `${slugify(label)}-${n}`
    usedSlugs.add(slug)
    return { ...view, label, slug }
  })
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

      // Licence sentences have no requirements - their equivalent page is /licence.
      if (isLicenceSentence(sentence)) return res.redirect('/licence')

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

      const requirements = toRequirementViews(sentence?.requirements)

      const mostRecentUpdate = (sentence?.requirements ?? [])
        .map(r => r.lastUpdatedAt)
        .filter(Boolean)
        .sort()
        .reverse()[0]

      const showCourtOrderSignpost = requirements.some(r => r.showCourtOrderSignpost)

      let courtOrderDocumentId: string | undefined
      if (config.features.documents && showCourtOrderSignpost) {
        courtOrderDocumentId = await findDocumentIdByType(services, crn, 'COURT_ORDER')
      }

      return res.render('pages/requirements', {
        overallOrder,
        requirements,
        showCourtOrderSignpost,
        courtOrderDocumentId,
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

      const requirement = toRequirementViews(sentence?.requirements).find(r => r.slug === req.params.slug)

      if (!requirement) return next()

      let courtOrderDocumentId: string | undefined
      if (config.features.documents && requirement.showCourtOrderSignpost) {
        courtOrderDocumentId = await findDocumentIdByType(services, crn, 'COURT_ORDER')
      }

      return res.render('pages/requirement-detail', { requirement, courtOrderDocumentId })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
