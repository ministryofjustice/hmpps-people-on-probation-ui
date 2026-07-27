import { Request, Router } from 'express'
import type { SanitisedError } from '@ministryofjustice/hmpps-rest-client'
import logger from '../../logger'
import buildOneLoginAuthorizeUrl from '../auth/oneLoginAuthorize'
import { authenticateOneLoginCallback, type OneLoginAuthenticatedUser } from '../auth/oneLoginToken'
import {
  createOneLoginTransaction,
  saveOneLoginTransaction,
  getOneLoginTransaction,
  deleteOneLoginTransaction,
  getOneLoginTransactionTtlSeconds,
  type OneLoginTransaction,
} from '../auth/loginTransactionStore'
import {
  createAuthenticatedUserSession,
  saveAuthenticatedUserSession,
  deleteAuthenticatedUserSession,
  getAuthenticatedUserSessionTtlSeconds,
  getAuthenticatedUserSession,
  refreshAuthenticatedUserSession,
} from '../auth/sessionStore'
import {
  setOneLoginTransactionCookie,
  clearOneLoginTransactionCookie,
  getOneLoginTransactionCookie,
  setAppSessionCookie,
  clearAppSessionCookie,
  getAppSessionCookie,
} from '../auth/cookies'
import { getOneLoginDiscoveryDocument } from '../auth/oneLoginDiscovery'
import { getPeopleOnProbationService } from '../services/peopleOnProbationService'
import config from '../config'
import normaliseReturnTo from '../auth/returnTo'
import { getOneLoginPublicJwk } from '../auth/oneLoginKeys'
import AuditService from '../services/auditService'
import type { RegisteredUserResponse, PeopleOnProbationApiErrorResponse } from '../data/peopleOnProbationApiClient'
import { trackServerAnalyticsEvent } from '../services/analyticsService'

const ALREADY_REGISTERED_ERROR_CODE = 'USER_ALREADY_REGISTERED'

const toError = (err: unknown): Error => {
  if (err instanceof Error) return err
  if (typeof err === 'string') return new Error(err)
  try {
    return new Error(JSON.stringify(err))
  } catch {
    return new Error(String(err))
  }
}

function normaliseToken(token?: string | null): string | null {
  return typeof token === 'string' && token.trim() ? token.trim() : null
}

function isAlreadyRegisteredError(err: unknown): boolean {
  const data = (err as SanitisedError<PeopleOnProbationApiErrorResponse> | null | undefined)?.data
  return data?.errorCode === ALREADY_REGISTERED_ERROR_CODE
}

function authErrorRedirect(err: unknown): string | null {
  if (!err) return '/sign-in-error'

  const responseStatus = (err as SanitisedError | null | undefined)?.responseStatus
  if (responseStatus === 409 || responseStatus === 410) return '/invite-expired'
  if (responseStatus === 401 || responseStatus === 403) return '/autherror'
  if (responseStatus && responseStatus >= 400 && responseStatus < 500) return '/sign-in-error'
  return null
}

async function getRegisteredUserDetails(transaction: OneLoginTransaction, oneLoginUser: OneLoginAuthenticatedUser) {
  if (transaction.registrationInviteToken) {
    return getPeopleOnProbationService().completeOneLoginRegistration({
      token: transaction.registrationInviteToken,
      oneLoginSubject: oneLoginUser.userId,
      email: oneLoginUser.email,
      mobileNumber: oneLoginUser.phoneNumber,
    })
  }

  return getPeopleOnProbationService().getCurrentRegisteredUser({
    oneLoginSubject: oneLoginUser.userId,
  })
}

function getAuthenticationTimestampDetails(transaction: OneLoginTransaction) {
  const timestamp = new Date().toISOString()
  if (transaction.registrationInviteToken) return { registrationTimestamp: timestamp }
  return { loginTimestamp: timestamp }
}

async function logAuthenticationAttempt(
  auditService: AuditService | undefined,
  req: Request,
  transaction: OneLoginTransaction,
  oneLoginUser: OneLoginAuthenticatedUser,
) {
  if (!auditService) return

  const eventDetails = {
    who: oneLoginUser.userId,
    subjectId: oneLoginUser.userId,
    subjectType: 'ONE_LOGIN_SUBJECT',
    correlationId: req.id,
    details: {
      attemptedAt: new Date().toISOString(),
      authenticationType: transaction.registrationInviteToken ? 'registration' : 'sign-in',
      returnTo: transaction.returnTo,
    },
  }

  try {
    if (transaction.registrationInviteToken) {
      await auditService.logUserRegistrationAttempt(eventDetails)
      return
    }

    await auditService.logUserSignInAttempt(eventDetails)
  } catch (err) {
    logger.warn({ err: toError(err) }, 'Failed to send authentication attempt audit event')
  }
}

async function logAuthenticationFailure(
  auditService: AuditService | undefined,
  req: Request,
  transaction: OneLoginTransaction,
  oneLoginUser: OneLoginAuthenticatedUser,
  reason: string,
  err?: unknown,
) {
  if (!auditService) return

  const eventDetails = {
    who: oneLoginUser.userId,
    subjectId: oneLoginUser.userId,
    subjectType: 'ONE_LOGIN_SUBJECT',
    correlationId: req.id,
    details: {
      failedAt: new Date().toISOString(),
      authenticationType: transaction.registrationInviteToken ? 'registration' : 'sign-in',
      reason,
      errorStatus: (err as SanitisedError | null | undefined)?.responseStatus,
    },
  }

  try {
    if (transaction.registrationInviteToken) {
      await auditService.logUserRegistrationFailure(eventDetails)
      return
    }

    await auditService.logUserSignInFailure(eventDetails)
  } catch (auditErr) {
    logger.warn({ err: toError(auditErr) }, 'Failed to send authentication failure audit event')
  }
}

async function logSuccessfulAuthentication(
  auditService: AuditService | undefined,
  req: Request,
  transaction: OneLoginTransaction,
  oneLoginUser: OneLoginAuthenticatedUser,
  registeredUserDetails: RegisteredUserResponse,
) {
  if (!auditService) return

  const eventDetails = {
    who: oneLoginUser.userId,
    subjectId: registeredUserDetails.personReference,
    correlationId: req.id,
    details: {
      ...getAuthenticationTimestampDetails(transaction),
      registeredUserId: registeredUserDetails.id,
      registeredUserStatus: registeredUserDetails.status,
    },
  }

  try {
    if (transaction.registrationInviteToken) {
      await auditService.logUserRegistered(eventDetails)
      return
    }

    await auditService.logUserSignedIn(eventDetails)
  } catch (err) {
    logger.warn({ err: toError(err) }, 'Failed to send authentication audit event')
  }
}

export default function setUpAuthentication(auditService?: AuditService): Router {
  const router = Router()

  router.get('/.well-known/jwks.json', (_req, res, next) => {
    try {
      return res.json({ keys: [getOneLoginPublicJwk()] })
    } catch (err) {
      return next(err)
    }
  })

  router.post('/session/keep-alive', async (req, res, next) => {
    try {
      const sessionId = getAppSessionCookie(req)
      if (!sessionId) return res.sendStatus(401)

      const session = await refreshAuthenticatedUserSession(sessionId)
      if (!session) {
        logger.info({ correlationId: req.id }, 'Session keep-alive failed: session not found or expired')
        clearAppSessionCookie(res)
        return res.sendStatus(401)
      }

      logger.info(
        { correlationId: req.id, crn: session.registeredUserDetails?.personReference },
        'Session keep-alive refreshed',
      )
      setAppSessionCookie(res, session.id, getAuthenticatedUserSessionTtlSeconds())
      return res.sendStatus(204)
    } catch (err) {
      return next(err)
    }
  })

  router.get('/session-timeout', async (req, res, next) => {
    try {
      const sessionId = getAppSessionCookie(req)
      if (sessionId) {
        const session = await getAuthenticatedUserSession(sessionId)
        logger.info(
          { correlationId: req.id, crn: session?.registeredUserDetails?.personReference },
          'Session timed out',
        )
        // Only fire session_ended when the session was still present at
        // this point (i.e. this route was reached via a proactive redirect
        // rather than the session having already expired/been evicted from
        // the store) — otherwise there's no reliable session/user data to
        // report and the analytics duration query already estimates from
        // the last recorded event in these cases.
        if (session) {
          trackServerAnalyticsEvent({
            eventName: 'session_ended',
            sessionId: session.id,
            userId: session.registeredUserDetails?.id,
            pagePath: req.path,
          })
        }
        await deleteAuthenticatedUserSession(sessionId)
        clearAppSessionCookie(res)
      }

      req.session?.destroy(() => undefined)
      return res.render('pages/session-timeout')
    } catch (err) {
      return next(err)
    }
  })

  // Local-only sign in path for running the app without GOV.UK One Login.
  // Guarded by LOCAL_AUTH_ENABLED and blocked from production in config.
  router.get('/local/sign-in', async (req, res, next) => {
    try {
      if (!config.localAuth.enabled) {
        return res.redirect('/')
      }

      const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : null
      let registeredUserDetails

      try {
        registeredUserDetails = await getPeopleOnProbationService().getCurrentRegisteredUser({
          oneLoginSubject: config.localAuth.oneLoginSubject,
        })
      } catch (err) {
        logger.warn({ err }, 'Failed to fetch registered user details during local sign in')
        const redirect = authErrorRedirect(err)
        return redirect ? res.redirect(redirect) : next(err)
      }

      const session = createAuthenticatedUserSession({
        userId: config.localAuth.oneLoginSubject,
        email: config.localAuth.email,
        displayName: config.localAuth.displayName,
        registeredUserDetails,
      })

      await saveAuthenticatedUserSession(session)
      setAppSessionCookie(res, session.id, getAuthenticatedUserSessionTtlSeconds())

      logger.info(
        { correlationId: req.id, crn: registeredUserDetails.personReference },
        'Local sign-in bypass used to establish session',
      )

      return res.redirect(`/welcome?firstVisit=true&returnTo=${encodeURIComponent(normaliseReturnTo(returnTo))}`)
    } catch (err) {
      return next(err)
    }
  })

  router.get('/sign-in/start', async (req, res, next) => {
    try {
      const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : null
      const rawToken = typeof req.query.token === 'string' ? req.query.token : null
      let registrationInviteToken = normaliseToken(rawToken)
      let flow = registrationInviteToken ? 'registration' : 'login'

      logger.info({ correlationId: req.id, flow }, 'Sign-in flow started')

      let registrationInviteId: string | undefined
      if (registrationInviteToken) {
        try {
          const invite = await getPeopleOnProbationService().validateRegistrationInvite(registrationInviteToken)
          registrationInviteId = invite.id
          logger.info({ correlationId: req.id, registrationInviteId }, 'Registration invite token validated')
        } catch (err: unknown) {
          if (isAlreadyRegisteredError(err)) {
            // The CRN behind this invite is already registered - most likely the user is
            // re-using an old invite link after completing registration. Treat this the
            // same as a normal sign-in instead of showing an expired/invalid invite error.
            logger.info(
              { correlationId: req.id },
              'Registration invite belongs to an already registered CRN; continuing as a sign-in',
            )
            registrationInviteToken = null
            flow = 'login'
          } else {
            logger.warn({ correlationId: req.id, err }, 'Registration invite token validation failed')
            trackServerAnalyticsEvent({
              eventName: 'registration_failed',
              pagePath: req.path,
              properties: { failureReason: 'invite_invalid_or_expired' },
            })
            const redirect = authErrorRedirect(err)
            return redirect ? res.redirect(redirect) : next(err)
          }
        }
      }

      const transaction = createOneLoginTransaction(
        returnTo,
        registrationInviteToken ?? undefined,
        registrationInviteId,
      )
      await saveOneLoginTransaction(transaction)

      setOneLoginTransactionCookie(res, transaction.id, getOneLoginTransactionTtlSeconds())

      const authorizeUrl = await buildOneLoginAuthorizeUrl(transaction)
      logger.info(
        { correlationId: req.id, transactionId: transaction.id, registrationInviteId, flow },
        'Redirecting to One Login authorize endpoint',
      )
      return res.redirect(authorizeUrl.toString())
    } catch (err) {
      return next(err)
    }
  })

  router.get('/sign-in/callback', async (req, res, next) => {
    try {
      const transactionId = getOneLoginTransactionCookie(req)

      if (!transactionId) {
        logger.warn({ correlationId: req.id }, 'One Login callback received without transaction cookie')
        return res.redirect('/sign-in-error')
      }

      const transaction = await getOneLoginTransaction(transactionId)

      if (!transaction) {
        logger.warn(
          { correlationId: req.id, transactionId },
          'One Login callback received with unknown or expired transaction',
        )
        clearOneLoginTransactionCookie(res)
        return res.redirect('/sign-in-error')
      }

      const flow = transaction.registrationInviteToken ? 'registration' : 'login'
      const { registrationInviteId } = transaction
      logger.info({ correlationId: req.id, transactionId, registrationInviteId, flow }, 'One Login callback received')

      const { code, state, error } = req.query

      if (error || typeof code !== 'string' || typeof state !== 'string') {
        logger.warn(
          { correlationId: req.id, transactionId, registrationInviteId, flow, error },
          'One Login callback error or missing code/state',
        )
        trackServerAnalyticsEvent({
          eventName: `${flow}_failed`,
          sessionId: transactionId,
          pagePath: req.path,
          properties: { failureReason: 'callback_error_or_missing_params' },
        })
        await deleteOneLoginTransaction(transactionId)
        clearOneLoginTransactionCookie(res)
        return res.redirect('/sign-in-error')
      }

      if (state !== transaction.state) {
        logger.warn(
          { correlationId: req.id, transactionId, registrationInviteId, flow },
          'One Login callback state mismatch',
        )
        trackServerAnalyticsEvent({
          eventName: `${flow}_failed`,
          sessionId: transactionId,
          pagePath: req.path,
          properties: { failureReason: 'state_mismatch' },
        })
        await deleteOneLoginTransaction(transactionId)
        clearOneLoginTransactionCookie(res)
        return res.redirect('/sign-in-error')
      }

      let oneLoginUser: OneLoginAuthenticatedUser
      try {
        oneLoginUser = await authenticateOneLoginCallback(code, transaction)
      } catch (err) {
        logger.warn(
          { correlationId: req.id, transactionId, registrationInviteId, flow, err },
          'One Login authentication failed',
        )
        trackServerAnalyticsEvent({
          eventName: `${flow}_failed`,
          sessionId: transactionId,
          pagePath: req.path,
          properties: { failureReason: 'one_login_authentication_failed' },
        })
        await deleteOneLoginTransaction(transactionId)
        clearOneLoginTransactionCookie(res)
        return res.redirect('/sign-in-error')
      }

      logger.info(
        { correlationId: req.id, transactionId, registrationInviteId, flow },
        'One Login token exchange succeeded',
      )

      await logAuthenticationAttempt(auditService, req, transaction, oneLoginUser)

      let registeredUserDetails
      try {
        registeredUserDetails = await getRegisteredUserDetails(transaction, oneLoginUser)
      } catch (err: unknown) {
        logger.warn(
          { correlationId: req.id, transactionId, registrationInviteId, flow, err },
          'Failed to fetch registered user details after One Login callback',
        )
        trackServerAnalyticsEvent({
          eventName: `${flow}_failed`,
          sessionId: transactionId,
          pagePath: req.path,
          properties: { failureReason: 'registered_user_details_failed' },
        })
        await deleteOneLoginTransaction(transactionId)
        clearOneLoginTransactionCookie(res)
        await logAuthenticationFailure(
          auditService,
          req,
          transaction,
          oneLoginUser,
          'registered_user_details_failed',
          err,
        )
        const redirect = authErrorRedirect(err)
        return redirect ? res.redirect(redirect) : next(err)
      }

      logger.info(
        {
          correlationId: req.id,
          transactionId,
          registrationInviteId,
          flow,
          crn: registeredUserDetails.personReference,
          registeredUserStatus: registeredUserDetails.status,
        },
        'Registered user details resolved',
      )

      const isRegistration = Boolean(transaction.registrationInviteToken)
      const session = createAuthenticatedUserSession({
        userId: oneLoginUser.userId,
        email: oneLoginUser.email,
        phoneNumber: oneLoginUser.phoneNumber,
        displayName: oneLoginUser.displayName,
        idToken: oneLoginUser.idToken,
        registeredUserDetails,
        isRegistrationSession: isRegistration,
      })

      await saveAuthenticatedUserSession(session)
      await deleteOneLoginTransaction(transactionId)

      clearOneLoginTransactionCookie(res)
      setAppSessionCookie(res, session.id, getAuthenticatedUserSessionTtlSeconds())

      await logSuccessfulAuthentication(auditService, req, transaction, oneLoginUser, registeredUserDetails)

      logger.info(
        {
          correlationId: req.id,
          transactionId,
          registrationInviteId,
          flow,
          crn: registeredUserDetails.personReference,
        },
        isRegistration ? 'User registration completed' : 'User signed in',
      )

      trackServerAnalyticsEvent({
        eventName: isRegistration ? 'registration_succeeded' : 'login_succeeded',
        sessionId: transactionId,
        pagePath: req.path,
        properties: { registeredUserStatus: registeredUserDetails.status },
        userId: registeredUserDetails.id,
      })

      // Distinct from registration_succeeded/login_succeeded (an auth outcome):
      // this marks the start of the authenticated session itself, using the
      // real app session id — the same id used for every subsequent
      // page_viewed/page_exited/session_ended event for this session (see
      // the /analytics/events proxy, which attaches it server-side since
      // the session cookie is httpOnly and the client can never read it).
      trackServerAnalyticsEvent({
        eventName: 'session_started',
        sessionId: session.id,
        userId: registeredUserDetails.id,
        pagePath: req.path,
      })

      const welcomeParams = new URLSearchParams({ returnTo: transaction.returnTo || '/' })
      if (isRegistration) welcomeParams.set('firstVisit', 'true')
      return res.redirect(`/welcome?${welcomeParams.toString()}`)
    } catch (err) {
      return next(err)
    }
  })

  router.get('/sign-out', async (req, res, next) => {
    try {
      const sessionId = getAppSessionCookie(req)
      const session = sessionId ? await getAuthenticatedUserSession(sessionId) : null
      const idToken = session?.idToken

      logger.info({ correlationId: req.id, crn: session?.registeredUserDetails?.personReference }, 'Sign-out requested')

      if (session) {
        trackServerAnalyticsEvent({
          eventName: 'session_ended',
          sessionId: session.id,
          userId: session.registeredUserDetails?.id,
          pagePath: req.path,
        })
      }

      if (sessionId) {
        await deleteAuthenticatedUserSession(sessionId)
        clearAppSessionCookie(res)
      }

      if (config.localAuth.enabled) {
        return res.redirect('/')
      }

      const discoveryDocument = await getOneLoginDiscoveryDocument().catch((): null => null)
      const endSessionEndpoint = discoveryDocument?.end_session_endpoint

      if (endSessionEndpoint) {
        const signOutUrl = new URL(endSessionEndpoint)
        if (idToken) {
          signOutUrl.searchParams.set('id_token_hint', idToken)
          signOutUrl.searchParams.set('post_logout_redirect_uri', config.oneLogin.postLogoutRedirectUri)
        } else {
          logger.warn(
            'Signing out without One Login ID token; redirecting to One Login logout without post logout redirect',
          )
        }
        return res.redirect(signOutUrl.toString())
      }

      return res.redirect('/')
    } catch (err) {
      return next(err)
    }
  })

  return router
}
