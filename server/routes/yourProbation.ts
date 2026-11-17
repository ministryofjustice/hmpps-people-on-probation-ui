import { Router } from 'express'

import type { Services } from '../services'
import { requireAuthentication } from '../auth/currentUser'
import { getSessionCrn } from '../auth/sessionStore'
import { combineSentences, findLicence, groupOrders } from '../utils/concurrentOrders'
import { hasIndeterminateSentence } from '../utils/currentLicence'
import logger from '../../logger'
import licenceRoutes, { renderLicenceOverview } from './licence'
import requirementsRoutes, { renderOrderOverview, renderOrdersSummary } from './requirements'

// "Your probation" is one URL for everyone: the licence page for someone on licence, the order
// requirements page otherwise (including people with no sentence yet). Someone on orders that don't
// match, or on licence and an order, gets a summary instead, linking to each one's own page
// (/your-probation/licence, /your-probation/orders/<event>). Each page's sub-pages sit under it too,
// e.g. /your-probation/standard-conditions and /your-probation/unpaid-work.
export default function yourProbationRoutes(services: Services): Router {
  const router = Router()

  router.use(requireAuthentication)

  router.get('/', async (req, res, next) => {
    try {
      const crn = getSessionCrn(res.locals.user)
      if (!crn) return res.redirect('/autherror')

      const { sentences } = await services.peopleOnProbationService.getSentences(crn)
      const { licence, withOrders } = findLicence(sentences)
      const orders = groupOrders(sentences.filter(sentence => sentence !== licence))
      const sentence = combineSentences(sentences)

      // On licence and an order: a summary linking to the licence's page and each order's page.
      if (withOrders) {
        // A licence for an indeterminate sentence (such as life) has no end date, as on the licence page.
        // If the licence can't be loaded, the sentence's end date is used, as on that page.
        const indeterminate = await hasIndeterminateSentence(services, crn).catch(err => {
          logger.warn({ correlationId: req.id, err }, 'Could not load the licence for the summary')
          return false
        })
        return renderOrdersSummary(
          res,
          orders,
          sentence,
          indeterminate ? { ...licence, expectedEndDate: undefined } : licence,
        )
      }
      if (licence) return await renderLicenceOverview(services, req, res, crn, licence)

      // Orders that don't match each get their own page, linked from a summary.
      return orders.length > 1
        ? renderOrdersSummary(res, orders, sentence)
        : await renderOrderOverview(services, res, crn, sentence)
    } catch (error) {
      return next(error)
    }
  })

  // Licence routes first: their fixed paths (standard-conditions, specific-conditions, conditions)
  // must win over the requirements router's /:slug.
  router.use(licenceRoutes(services))
  router.use(requirementsRoutes(services))

  return router
}
