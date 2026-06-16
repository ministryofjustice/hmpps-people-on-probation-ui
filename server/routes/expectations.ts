import { Router } from 'express'
import type { Services } from '../services'
import { requireAuthentication } from '../auth/currentUser'

export default function expectationsRoutes(_services: Services): Router {
  const router = Router()

  router.use(requireAuthentication)

  router.get('/', (req, res) => {
    const tab = req.query.tab === 'you' ? 'you' : 'probation-service'
    res.render('pages/expectations', { tab })
  })

  return router
}
