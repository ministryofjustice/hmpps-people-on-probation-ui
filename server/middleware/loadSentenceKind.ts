import type { Request, Response, NextFunction } from 'express'
import logger from '../../logger'
import type { Services } from '../services'
import { getSessionCrn, saveAuthenticatedUserSession } from '../auth/sessionStore'
import { getSentencesKind } from '../utils/utils'

// The nav and home tiles label the order section differently for licence sentences, and the
// nav is on every page. Rather than fetching sentences on every request, resolve the kind once
// per session and cache it there (null = looked up, neither kind). A failed lookup is left
// uncached so the next request retries, and the labels fall back to the community order ones.
//
// The kind also gates people on licence while FEATURE_LICENCE is off (see isOnLicenceWithFeatureOff), so it
// looks for a licence across all sentences.

export default function loadSentenceKind(services: Pick<Services, 'peopleOnProbationService'>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { user } = res.locals
    const crn = getSessionCrn(user)

    if (user && crn && user.sentenceKind === undefined) {
      try {
        const sentenceProgress = await services.peopleOnProbationService.getSentences(crn)
        const sentenceKind = getSentencesKind(sentenceProgress.sentences) ?? null
        res.locals.user = { ...user, sentenceKind }
        await saveAuthenticatedUserSession(res.locals.user)
      } catch (error) {
        logger.warn({ correlationId: req.id, err: error }, 'Could not resolve sentence kind for navigation')
      }
    }

    res.locals.isLicence = res.locals.user?.sentenceKind === 'LICENCE'
    next()
  }
}
