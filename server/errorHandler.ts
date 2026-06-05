import type { Request, Response, NextFunction } from 'express'
import type { HTTPError } from 'superagent'
import logger from '../logger'

export default function createErrorHandler(_production: boolean) {
  return (error: HTTPError, req: Request, res: Response, _next: NextFunction): void => {
    if (error.status === 404) {
      logger.info(`Not found: '${req.originalUrl}', user '${res.locals.user?.userId}'`)
      res.status(404)
      return res.render('pages/not-found')
    }

    logger.error(`Error handling request for '${req.originalUrl}', user '${res.locals.user?.userId}'`, error)

    res.status(error.status || 500)
    return res.render('pages/error')
  }
}
