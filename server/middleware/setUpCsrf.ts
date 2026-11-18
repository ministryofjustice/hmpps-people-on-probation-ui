import { Router, Request } from 'express'
import { csrfSync } from 'csrf-sync'

const testMode = process.env.NODE_ENV === 'test'

/**
 * Forms and the chat widget send the token in the body (`_csrf`). The chatbot
 * voice transcribe route posts a raw audio body with no fields, so it sends
 * the token in the X-CSRF-Token header instead (csrf-sync's own default).
 * Body wins when both are present.
 */
export function getCsrfTokenFromRequest(req: Request): string | undefined {
  // eslint-disable-next-line no-underscore-dangle
  const fromBody = req.body?._csrf
  if (typeof fromBody === 'string') return fromBody
  const fromHeader = req.headers['x-csrf-token']
  return typeof fromHeader === 'string' ? fromHeader : undefined
}

export default function setUpCsrf(): Router {
  const router = Router({ mergeParams: true })

  // CSRF protection
  if (!testMode) {
    const {
      csrfSynchronisedProtection, // This is the default CSRF protection middleware.
    } = csrfSync({
      getTokenFromRequest: getCsrfTokenFromRequest,
    })

    router.use(csrfSynchronisedProtection)
  }

  router.use((req, res, next) => {
    if (typeof req.csrfToken === 'function') {
      res.locals.csrfToken = req.csrfToken()
    }
    next()
  })

  return router
}
