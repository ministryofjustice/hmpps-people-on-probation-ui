import { Router } from 'express'
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

function normaliseToken(token?: string | null): string | null {
  return typeof token === 'string' && token.trim() ? token.trim() : null
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

export default function setUpAuthentication(): Router {
  const router = Router()

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
        return res.redirect('/autherror')
      }

      const session = createAuthenticatedUserSession({
        userId: config.localAuth.oneLoginSubject,
        email: config.localAuth.email,
        displayName: config.localAuth.displayName,
        registeredUserDetails,
      })

      await saveAuthenticatedUserSession(session)
      setAppSessionCookie(res, session.id, getAuthenticatedUserSessionTtlSeconds())

      return res.redirect(normaliseReturnTo(returnTo))
    } catch (err) {
      return next(err)
    }
  })

  router.get('/sign-in/start', async (req, res, next) => {
    try {
      const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : null
      const rawToken = typeof req.query.token === 'string' ? req.query.token : null
      const registrationInviteToken = normaliseToken(rawToken)

      if (registrationInviteToken) {
        try {
          await getPeopleOnProbationService().validateRegistrationInvite(registrationInviteToken)
        } catch (err) {
          logger.warn({ err }, 'Registration invite token validation failed')
          return res.redirect('/autherror')
        }
      }

      const transaction = createOneLoginTransaction(returnTo, registrationInviteToken ?? undefined)
      await saveOneLoginTransaction(transaction)

      setOneLoginTransactionCookie(res, transaction.id, getOneLoginTransactionTtlSeconds())

      const authorizeUrl = await buildOneLoginAuthorizeUrl(transaction)
      return res.redirect(authorizeUrl.toString())
    } catch (err) {
      return next(err)
    }
  })

  router.get('/sign-in/callback', async (req, res, next) => {
    try {
      const transactionId = getOneLoginTransactionCookie(req)

      if (!transactionId) {
        logger.warn('One Login callback received without transaction cookie')
        return res.redirect('/autherror')
      }

      const transaction = await getOneLoginTransaction(transactionId)

      if (!transaction) {
        logger.warn('One Login callback received with unknown or expired transaction')
        clearOneLoginTransactionCookie(res)
        return res.redirect('/autherror')
      }

      const { code, state, error } = req.query

      if (error || typeof code !== 'string' || typeof state !== 'string') {
        logger.warn({ error }, 'One Login callback error or missing code/state')
        await deleteOneLoginTransaction(transactionId)
        clearOneLoginTransactionCookie(res)
        return res.redirect('/autherror')
      }

      if (state !== transaction.state) {
        logger.warn('One Login callback state mismatch')
        await deleteOneLoginTransaction(transactionId)
        clearOneLoginTransactionCookie(res)
        return res.redirect('/autherror')
      }

      const oneLoginUser = await authenticateOneLoginCallback(code, transaction)

      let registeredUserDetails
      try {
        registeredUserDetails = await getRegisteredUserDetails(transaction, oneLoginUser)
      } catch (err) {
        logger.warn({ err }, 'Failed to fetch registered user details after One Login callback')
        await deleteOneLoginTransaction(transactionId)
        clearOneLoginTransactionCookie(res)
        return res.redirect('/autherror')
      }

      const session = createAuthenticatedUserSession({
        userId: oneLoginUser.userId,
        email: oneLoginUser.email,
        phoneNumber: oneLoginUser.phoneNumber,
        displayName: oneLoginUser.displayName,
        idToken: oneLoginUser.idToken,
        registeredUserDetails,
      })

      await saveAuthenticatedUserSession(session)
      await deleteOneLoginTransaction(transactionId)

      clearOneLoginTransactionCookie(res)
      setAppSessionCookie(res, session.id, getAuthenticatedUserSessionTtlSeconds())

      return res.redirect(transaction.returnTo || '/')
    } catch (err) {
      return next(err)
    }
  })

  router.get('/sign-out', async (req, res, next) => {
    try {
      const sessionId = getAppSessionCookie(req)
      const session = sessionId ? await getAuthenticatedUserSession(sessionId) : null
      const idToken = session?.idToken

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
