import crypto from 'crypto'
import express, { Router, Request, Response, NextFunction } from 'express'
import helmet from 'helmet'
import config from '../config'

export default function setUpWebSecurity(): Router {
  const router = express.Router()

  // Secure code best practice - see:
  // 1. https://expressjs.com/en/advanced/best-practice-security.html,
  // 2. https://www.npmjs.com/package/helmet
  router.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString('hex')
    next()
  })
  router.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // This nonce allows us to use scripts with the use of the `cspNonce` local, e.g (in a Nunjucks template):
          // <script nonce="{{ cspNonce }}">
          // or
          // <link href="http://example.com/" rel="stylesheet" nonce="{{ cspNonce }}">
          // This ensures only scripts we trust are loaded, and not anything injected into the
          // page by an attacker.
          scriptSrc: [
            "'self'",
            'https://embed.smartsurvey.io',
            (_req: Request, res: Response) => `'nonce-${res.locals.cspNonce}'`,
          ],
          // 'unsafe-inline' for SmartSurvey popup which injects inline styles dynamically.
          // No style nonce is used in templates so this does not weaken our script nonce policy.
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'https://embed.smartsurvey.io'],
          connectSrc: ["'self'", 'https://www.smartsurvey.co.uk'],
          frameSrc: ['https://www.smartsurvey.co.uk'],
          formAction: [`'self' ${config.oneLogin.issuerUrl}`],
          ...(config.production ? {} : { upgradeInsecureRequests: null }),
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  )
  return router
}
