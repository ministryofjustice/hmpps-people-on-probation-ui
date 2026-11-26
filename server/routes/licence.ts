import { Router, type Request, type Response } from 'express'
import type { SanitisedError } from '@ministryofjustice/hmpps-rest-client'

import type { Services } from '../services'
import type {
  CurfewAddressResponse,
  LicenceConditionImage,
  LicenceSummaryResponse,
  SentenceResponse,
} from '../data/peopleOnProbationApiClient'
import config from '../config'
import { requireAuthentication } from '../auth/currentUser'
import { getSessionCrn } from '../auth/sessionStore'
import {
  calculateDateProgress,
  formatDate,
  formatDateTimeWithDay,
  formatLicenceSentenceType,
  isLongerThanMonths,
} from '../utils/utils'
import { findDocumentIdByType } from '../utils/documentTypes'
import { getSentenceTypeExplanationTemplate } from '../utils/sentenceCategories'
import logger from '../../logger'
import {
  BESPOKE_CONDITIONS_KEY,
  TAG_CONDITION_GROUP_KEYS,
  toBespokeConditionGroup,
  toAdditionalConditionGroup,
  toAdditionalConditionGroups,
  toLicenceTags,
  type AdditionalConditionGroupView,
} from '../utils/licenceConditions'
import findCurrentLicence, { findCurrentLicenceSummary, findLicenceById } from '../utils/currentLicence'
import { findLicence } from '../utils/concurrentOrders'

type LicenceTagView = {
  tagType: string
  endDate?: string
}

type LicenceSentenceView = {
  type?: string
  typeExplanationTemplate?: string
  // The sentence's dates, from nDelius.
  startDate?: string
  endDate?: string
  totalLength?: string
  // The licence's own dates, for "You are on licence" and the time until the licence ends.
  licenceExpiryDate?: string
  percentComplete?: number
  remainingDuration?: string
  tags: LicenceTagView[]
}

// The licence page: "Your probation" for someone on licence only, or "Your sentence and licence" for
// someone also on an order. /your-probation decides which page to show (see yourProbation.ts), so this
// takes the sentence it already looked up.
export async function renderLicenceOverview(
  services: Services,
  req: Request,
  res: Response,
  crn: string,
  sentence: SentenceResponse,
  withOrders = false,
) {
  // The licence (for the tag rows and whether the sentence ends) and the licence document don't depend
  // on each other.
  const [{ tags, indeterminate, licenceStartDate, licenceExpiryDate }, licenceDocumentId] = await Promise.all([
    findLicenceDetails(services, crn, req.id),
    config.features.documents ? findDocumentIdByType(services, crn, 'LICENCE_CONDITION') : undefined,
  ])

  // An indeterminate sentence (such as life) has no end date, so there's no end date, length or time
  // left to show, whatever end dates nDelius and Prisoner Search have.
  const endDate = indeterminate ? undefined : sentence.expectedEndDate
  const expiryDate = indeterminate ? undefined : licenceExpiryDate
  // The sentence card shows the whole sentence, from nDelius. The time until the licence ends runs from
  // release (CVL's licence start date) to the licence expiry date, so it leaves out the time in custody.
  const sentenceProgress =
    sentence.startDate && endDate ? calculateDateProgress(sentence.startDate, endDate) : undefined
  const licenceProgress =
    licenceStartDate && expiryDate ? calculateDateProgress(licenceStartDate, expiryDate) : undefined

  const licenceSentence: LicenceSentenceView = {
    type: formatLicenceSentenceType(sentence.type),
    typeExplanationTemplate: getSentenceTypeExplanationTemplate(sentence.typeCode, 'licence'),
    startDate: formatDate(sentence.startDate),
    endDate: formatDate(endDate),
    totalLength: sentenceProgress?.totalLength,
    licenceExpiryDate: formatDate(expiryDate),
    percentComplete: licenceProgress?.percentComplete,
    remainingDuration: licenceProgress?.remainingDuration,
    tags,
  }

  return res.render('pages/licence', { licenceSentence, licenceDocumentId, withOrders })
}

export default function licenceRoutes(services: Services): Router {
  const router = Router()

  router.use(requireAuthentication)

  // The licence's own page, linked from the "Your probation" summary for someone also on an order.
  router.get('/licence', async (req, res, next) => {
    try {
      const crn = getSessionCrn(res.locals.user)
      if (!crn) return res.redirect('/autherror')

      const { sentences } = await services.peopleOnProbationService.getSentences(crn)
      const { licence, withOrders } = findLicence(sentences)
      if (!licence) return next()

      return await renderLicenceOverview(services, req, res, crn, licence, withOrders)
    } catch (error) {
      return next(error)
    }
  })

  router.get('/standard-conditions', async (req, res, next) => {
    try {
      const crn = getSessionCrn(res.locals.user)
      if (!crn) return res.redirect('/autherror')

      const { sentences } = await services.peopleOnProbationService.getSentences(crn)
      const { licence: sentence, withOrders } = findLicence(sentences)
      if (!sentence) return res.redirect('/your-probation')

      const licence = await findCurrentLicence(services, crn)
      return res.render('pages/licence-standard-conditions', {
        // CVL's own wording, in CVL's order, so they match the person's licence document.
        conditions: (licence?.conditions?.AP?.standard ?? []).map(({ text }) => text).filter(Boolean),
        lastUpdatedAt: formatDateTimeWithDay(licence?.updatedDateTime ?? licence?.approvedDateTime),
        // The firearms restriction applies to sentences longer than 3 months, which an indeterminate
        // sentence always is.
        showFirearms:
          licence?.indeterminateSentence === true ||
          isLongerThanMonths(sentence.startDate, sentence.expectedEndDate, 3),
        withOrders,
      })
    } catch (error) {
      return next(error)
    }
  })

  router.get('/specific-conditions', async (req, res, next) => {
    try {
      const crn = getSessionCrn(res.locals.user)
      if (!crn) return res.redirect('/autherror')

      const { sentences } = await services.peopleOnProbationService.getSentences(crn)
      const { licence: sentence, withOrders } = findLicence(sentences)
      if (!sentence) return res.redirect('/your-probation')

      const licence = await findCurrentLicence(services, crn)
      const { groups, unknownCodes, hasUnshownElectronicMonitoring } = toAdditionalConditionGroups(
        licence?.conditions?.AP?.additional,
      )
      if (unknownCodes.length) {
        logger.warn(
          { correlationId: req.id, licenceId: licence?.id, unknownCodes },
          'Additional licence conditions with no group, shown under their CVL category',
        )
      }
      if (hasUnshownElectronicMonitoring) {
        logger.warn(
          { correlationId: req.id, licenceId: licence?.id },
          'Electronic monitoring licence condition with no tag condition, so not shown',
        )
      }

      // Only shown when the licence has bespoke conditions. Its key and title come from the bespoke group,
      // so the card always matches the page it links to.
      const bespoke = toBespokeConditionGroup(licence?.conditions?.AP?.additional, licence?.conditions?.AP?.bespoke)

      return res.render('pages/licence-specific-conditions', {
        // False when CVL has no licence for the person yet (an empty list or 404), so we can't say
        // whether they have conditions specific to them.
        licenceAvailable: Boolean(licence),
        groups,
        bespokeGroup: bespoke && { key: bespoke.key, title: bespoke.title },
        lastUpdatedAt: formatDateTimeWithDay(licence?.updatedDateTime ?? licence?.approvedDateTime),
        withOrders,
      })
    } catch (error) {
      return next(error)
    }
  })

  // A same-origin proxy for a licence condition's uploaded image (e.g. an exclusion zone map), so an
  // <img> can show it without exposing API tokens. The CRN always comes from the session, never the URL.
  router.get('/conditions/:licenceId/:conditionId/image', async (req, res, next) => {
    const crn = getSessionCrn(res.locals.user)
    if (!crn) return res.redirect('/autherror')

    const { licenceId, conditionId } = req.params
    if (!POSITIVE_INTEGER.test(licenceId) || !POSITIVE_INTEGER.test(conditionId)) return next()

    let image: LicenceConditionImage
    try {
      image = await services.peopleOnProbationService.getLicenceConditionImage(
        crn,
        Number(licenceId),
        Number(conditionId),
      )
    } catch (error) {
      const status = (error as SanitisedError | undefined)?.responseStatus
      if (status === 404 || status === 400) return next()
      logger.error({ correlationId: req.id, licenceId, conditionId, status }, 'Could not load licence condition image')
      return next(error)
    }

    // The API sets the type from the bytes; only pass on image types a browser can show safely.
    const contentType = image.contentType.split(';')[0].trim().toLowerCase()
    if (!IMAGE_CONTENT_TYPES.includes(contentType)) {
      logger.error(
        { correlationId: req.id, licenceId, conditionId, contentType },
        'Licence condition image has an unexpected content type',
      )
      return next(Object.assign(new Error('Unexpected licence condition image content type'), { status: 502 }))
    }

    res.set({
      'Content-Type': contentType,
      'Content-Length': String(image.body.length),
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
    })
    return res.send(image.body)
  })

  router.get('/specific-conditions/:groupKey', async (req, res, next) => {
    try {
      const crn = getSessionCrn(res.locals.user)
      if (!crn) return res.redirect('/autherror')

      const { sentences } = await services.peopleOnProbationService.getSentences(crn)
      const { licence: sentence, withOrders } = findLicence(sentences)
      if (!sentence) return res.redirect('/your-probation')

      const licence = await findCurrentLicence(services, crn)
      const additional = licence?.conditions?.AP?.additional
      const group =
        req.params.groupKey === BESPOKE_CONDITIONS_KEY
          ? toBespokeConditionGroup(additional, licence?.conditions?.AP?.bespoke)
          : toAdditionalConditionGroup(additional, req.params.groupKey)
      if (!group) return next()

      const { groups } = toAdditionalConditionGroups(additional)
      return res.render('pages/licence-condition-group', {
        group: licence?.id ? withMaps(group, licence.id) : group,
        mapHeadings: MAP_PAGES[group.key],
        approvedAddress: group.key === 'follow-a-curfew' ? toAddressLines(licence?.curfewAddress) : undefined,
        showAppointmentsLink: APPOINTMENTS_LINK_GROUP_KEYS.includes(group.key),
        helpTemplate: licenceConditionHelpTemplate(group.key),
        // The curfew help links to the person's tag conditions, when they have some.
        tagGroupKey: TAG_CONDITION_GROUP_KEYS.find(key => groups.some(g => g.key === key)),
        withOrders,
      })
    } catch (error) {
      return next(error)
    }
  })

  return router
}

type LicenceDetails = {
  tags: LicenceTagView[]
  indeterminate: boolean
  licenceStartDate?: string
  licenceExpiryDate?: string
}

// From the person's CVL licence, for the licence page: whether their sentence is indeterminate and when
// the licence expires (both from Prisoner Search, on the licence summary), and when the licence started and
// their electronic monitoring tags (from the licence's details). Each is looked up on its own, so if the
// details can't be loaded the page still has what the summary gives. If the summary can't be loaded
// either, the page has no licence dates or tags.
const findLicenceDetails = async (services: Services, crn: string, correlationId: string): Promise<LicenceDetails> => {
  let summary: LicenceSummaryResponse | undefined
  try {
    summary = await findCurrentLicenceSummary(services, crn)
  } catch (error) {
    logger.warn({ correlationId, err: error }, 'Could not load the licence summary for the licence page')
    return { tags: [], indeterminate: false }
  }
  if (!summary) return { tags: [], indeterminate: false }
  const fromSummary = {
    indeterminate: summary.indeterminateSentence === true,
    licenceExpiryDate: summary.licenceExpiryDate,
  }

  try {
    const licence = await findLicenceById(services, crn, summary.id)
    return {
      ...fromSummary,
      licenceStartDate: licence?.licenceStartDate,
      tags: toLicenceTags(licence?.conditions?.AP?.additional).map(({ tagType, endDate }) => ({
        tagType,
        endDate: formatDate(endDate),
      })),
    }
  } catch (error) {
    logger.warn({ correlationId, err: error }, 'Could not load the licence for the licence page')
    return { ...fromSummary, tags: [] }
  }
}

// The lines of a home detention curfew licence's curfew address, without the blank ones, for the
// "Your approved address" card on the curfew page. Undefined when there's no address to show.
const toAddressLines = (address?: CurfewAddressResponse): string[] | undefined => {
  if (!address) return undefined
  const lines = [address.firstLine, address.secondLine, address.townOrCity, address.county, address.postcode]
    .map(line => line?.trim())
    .filter(Boolean)
  return lines.length ? lines : undefined
}

// Pages that signpost to the appointments page with a "View your appointments and activities" link,
// rather than picking out and listing the condition's appointments here.
const APPOINTMENTS_LINK_GROUP_KEYS = ['things-you-need-to-take-part-in', 'take-drug-tests']

const POSITIVE_INTEGER = /^[1-9]\d*$/

const IMAGE_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/gif']

type MapHeadings = {
  // Above the map (when it isn't collapsed), and in its alt text.
  map: string
  // Above CVL's description of the mapped area, when it has one.
  description: string
}

// Pages that show the maps uploaded for their conditions (hasImageUpload), with their headings. To show
// maps on another page, add its group key and both headings here.
const MAP_PAGES: Record<string, MapHeadings> = {
  'areas-and-places-you-must-not-go-to': {
    map: 'Map of the area you must not enter',
    description: 'Description of area you must not enter',
  },
  'areas-you-must-not-leave': {
    map: 'Map of the area you must not leave',
    description: 'Description of area you must not leave',
  },
  // CVL doesn't attach maps to this page's condition (5db26ab3) yet: it names the area in its text. Listed
  // so a map is shown if one is ever uploaded; without one, the page shows only the condition text.
  'area-you-must-live-in': {
    map: 'Map of the area you must live in',
    description: 'Description of area you must live in',
  },
}

// Adds the image proxy URL to each condition with an uploaded map, so the map is shown under it.
const withMaps = (group: AdditionalConditionGroupView, licenceId: number): AdditionalConditionGroupView =>
  MAP_PAGES[group.key]
    ? {
        ...group,
        conditions: group.conditions.map(condition =>
          condition.hasImageUpload && condition.id
            ? { ...condition, mapUrl: `/your-probation/conditions/${licenceId}/${condition.id}/image` }
            : condition,
        ),
      }
    : group

// Help for a group's page, when it has some: the group key and its template in
// views/partials/licence-condition-help/.
const LICENCE_CONDITION_HELP: Record<string, string> = {
  'follow-a-curfew': 'follow-a-curfew',
  'areas-and-places-you-must-not-go-to': 'areas-and-places-you-must-not-go-to',
  'areas-you-must-not-leave': 'areas-you-must-not-leave',
  'take-drug-tests': 'take-drug-tests',
  'things-you-are-not-allowed-to-do': 'things-you-are-not-allowed-to-do',
  'things-you-must-tell-your-probation-officer-about': 'things-you-must-tell-your-probation-officer-about',
  'things-you-are-not-allowed-to-use-have-or-own': 'things-you-are-not-allowed-to-use-have-or-own',
  'people-you-must-not-contact-or-associate-with': 'people-you-must-not-contact-or-associate-with',
  'area-you-must-live-in': 'area-you-must-live-in',
  'money-and-assets-you-are-allowed-to-have': 'money-and-assets-you-are-allowed-to-have',
  'things-you-need-to-take-part-in': 'things-you-need-to-take-part-in',
  // Every tag page has the same help.
  'wear-a-gps-tag': 'wear-a-tag',
  'wear-a-curfew-or-rf-tag': 'wear-a-tag',
  'wear-an-alcohol-tag': 'wear-a-tag',
}

const licenceConditionHelpTemplate = (groupKey: string): string | undefined =>
  LICENCE_CONDITION_HELP[groupKey]
    ? `partials/licence-condition-help/${LICENCE_CONDITION_HELP[groupKey]}.njk`
    : undefined
