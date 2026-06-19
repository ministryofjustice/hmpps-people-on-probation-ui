import { Router } from 'express'
import type { Services } from '../services'
import { requireAuthentication } from '../auth/currentUser'

export default function feedbackRoutes(_services: Services): Router {
  const router = Router()

  router.use(requireAuthentication)

  router.get('/', (_req, res) => {
    res.render('pages/feedback')
  })

  return router
}
