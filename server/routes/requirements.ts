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
  hasDateArrived,
  estimateEndDate,
  isLicenceSentence,
} from '../utils/utils'
import type { RequirementResponse } from '../data/peopleOnProbationApiClient'
import { findDocumentIdByType } from '../utils/documentTypes'
import { ADMINISTRATIVE_RAR_CATEGORY_CODE, TAG_CATEGORY_CODES } from '../utils/categoryCodes'
import {
  explanationTemplate,
  getRequirementType,
  helpTemplate,
  TAG_REQUIREMENT_KINDS,
  type RequirementKind as KnownRequirementKind,
} from '../utils/requirementTypes'

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

export type RequirementKind = KnownRequirementKind | 'other'

export type RequirementView = {
  label: string
  slug: string
  kind: RequirementKind
  showCourtOrderSignpost: boolean
  explanationTemplate?: string
  helpTemplate?: string
  percentComplete?: number
  completedDuration?: string
  required?: number
  completed?: number
  unit?: string
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

export function toRequirementView(requirement: RequirementResponse): RequirementView {
  const code = requirement.mainCategory?.code
  const type = getRequirementType(code)
  const kind: RequirementKind = type?.kind ?? 'other'
  const label =
    type?.label || requirement.mainCategory?.description || requirement.subCategory?.description || 'Requirement'
  const slug = slugify(label)
  // Tag codes without a type of their own still point to the court order.
  const showCourtOrderSignpost = type ? type.showCourtOrderSignpost : TAG_CATEGORY_CODES.includes(code)
  const common = {
    label,
    slug,
    kind,
    showCourtOrderSignpost,
    explanationTemplate: explanationTemplate(type),
    helpTemplate: helpTemplate(type),
  }
  const lastUpdatedAt = formatDateTimeWithDay(requirement.lastUpdatedAt)

  const startDate = requirement.actualStartDate ?? requirement.expectedStartDate ?? requirement.imposedDate
  // A requirement that has ended (including early) has an actual end date; until then, use the expected one.
  const endDate = requirement.actualEndDate ?? requirement.expectedEndDate

  const hasRequired = Boolean(requirement.required && requirement.required > 0)
  const hasCompleted = requirement.completed !== undefined && requirement.completed !== null
  // The court-ordered amount, e.g. "40 hours" or "12 months".
  const requiredLength = hasRequired
    ? `${requirement.required} ${formatUnit(requirement.unit, requirement.required)}`
    : undefined

  // Progress, using the first of these that the data allows:
  // 1. A completed amount is recorded: count it against the required amount.
  // 2. Unpaid work and RAR (countsProgress) are always counted: no completed amount means none done yet.
  // 3. Start and end dates: how far today is between them.
  // 4. A required length of time (days, weeks, months, years) and an actual start date, but no end
  //    date: an estimated end (actual start + required). See below.
  // 5. Otherwise: no progress, just the details.
  if (hasRequired && (hasCompleted || type?.countsProgress)) {
    const completed = Math.min(requirement.completed ?? 0, requirement.required)
    const remaining = Math.max(requirement.required - completed, 0)
    const percentComplete = Math.round((completed / requirement.required) * 100)
    const remainingUnitLabel = formatUnit(requirement.unit, remaining)
    const completedLabel = formatUnit(requirement.unit, completed)
    return {
      ...common,
      required: requirement.required,
      completed,
      unit: requirement.unit,
      remaining,
      remainingUnitLabel,
      percentComplete,
      completedDuration: `${completed} ${completedLabel}`,
      startDate: formatDate(startDate) ?? startDate,
      endDate: formatDate(endDate) ?? endDate,
      totalLength: requiredLength,
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
    // An actual end date means the requirement has finished, so on that day it is complete. Date
    // progress alone counts the end day as still to come (e.g. 97% and 1 day remaining). An
    // expected end date of today is still the last day, so that case is left as it is.
    const hasEnded = Boolean(requirement.actualEndDate) && hasDateArrived(requirement.actualEndDate)
    return {
      ...common,
      percentComplete: hasEnded ? 100 : percentComplete,
      completedDuration,
      // The court-ordered length (e.g. "12 months") when there is one, not the span between the dates.
      totalLength: requiredLength ?? totalLength,
      remainingDuration: hasEnded ? '0 days' : remainingDuration,
      startDate: fmtStart,
      endDate: fmtEnd,
      lastUpdatedAt,
    }
  }

  // An estimate only: it assumes the requirement runs without a break from its actual start, so it
  // isn't shown as the end date, and it never reaches 100% - only nDelius (an actual end date) can say
  // a requirement has ended. Not used without an actual start, as it may not have begun yet.
  const estimatedEndDate =
    hasRequired && requirement.actualStartDate
      ? estimateEndDate(requirement.actualStartDate, requirement.required, requirement.unit)
      : undefined
  if (estimatedEndDate) {
    const {
      percentComplete,
      completedDuration,
      remainingDuration,
      startDate: fmtStart,
    } = calculateDateProgress(requirement.actualStartDate, estimatedEndDate)
    return {
      ...common,
      percentComplete: Math.min(percentComplete, 99),
      completedDuration,
      totalLength: requiredLength,
      // Past the estimated end ('0 days'), there's nothing meaningful to say is remaining.
      remainingDuration: remainingDuration === '0 days' ? undefined : remainingDuration,
      startDate: fmtStart,
      lastUpdatedAt,
    }
  }

  // No count and no dates to measure against (e.g. accredited programmes): just the details.
  return {
    ...common,
    totalLength: requiredLength,
    startDate: formatDate(startDate) ?? startDate,
    endDate: formatDate(endDate) ?? endDate,
    lastUpdatedAt,
  }
}

// MPOP creates an administrative 'RAR' requirement (see ADMINISTRATIVE_RAR_CATEGORY_CODE) that
// the person doesn't need to know about, so it's left out of everything shown to them.
export const shownRequirements = (requirements: RequirementResponse[] = []): RequirementResponse[] =>
  requirements.filter(requirement => requirement.mainCategory?.code !== ADMINISTRATIVE_RAR_CATEGORY_CODE)

// Requirements sharing a label (e.g. Unpaid Work "Regular" and "Additional Hours") get the
// sub-category appended so each has its own card and detail page.
export function toRequirementViews(allRequirements: RequirementResponse[] = []): RequirementView[] {
  const requirements = shownRequirements(allRequirements)
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

      const mostRecentUpdate = shownRequirements(sentence?.requirements)
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

      const requirements = toRequirementViews(sentence?.requirements)
      const requirement = requirements.find(r => r.slug === req.params.slug)

      if (!requirement) return next()

      // The curfew explanation links to the rules for wearing a tag, when the person also has a tag
      // requirement: the first one found in TAG_REQUIREMENT_KINDS order (GPS first).
      const tagSlug = TAG_REQUIREMENT_KINDS.map(kind => requirements.find(r => r.kind === kind)).find(Boolean)?.slug

      let courtOrderDocumentId: string | undefined
      if (config.features.documents && requirement.showCourtOrderSignpost) {
        courtOrderDocumentId = await findDocumentIdByType(services, crn, 'COURT_ORDER')
      }

      return res.render('pages/requirement-detail', { requirement, courtOrderDocumentId, tagSlug })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
