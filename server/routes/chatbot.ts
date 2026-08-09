import { Router, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import config from '../config'
import logger from '../../logger'
import type { Services } from '../services'
import { getSessionCrn } from '../auth/sessionStore'
import { shouldShowAppointment, toAppointmentCardView } from './appointments'
import type { AppointmentCardView } from './appointments'
import { toRequirementView } from './requirements'
import type { RequirementView } from './requirements'
import { toGoalView } from './goals'
import type { GoalView } from './goals'
import { formatPractitionerName } from '../utils/utils'
import type {
  AddressResponse,
  PersonalDetailsResponse,
  PersonalContactResponse,
  ManagerResponse,
  SentenceProgressResponse,
  SentenceResponse,
  AppointmentResponse,
  SentencePlanResponse,
} from '../data/peopleOnProbationApiClient'

// Inactivity-only timeout. Not a cap on the whole streamed response —
// legitimate long LLM answers can easily take longer than 30s to fully
// stream. We reset this timer on every chunk we receive; if the upstream
// stops sending for this long, we abort and surface an error frame.
const UPSTREAM_INACTIVITY_TIMEOUT_MS = 30_000
const POP_USER_TOKEN_TTL_SECONDS = 5 * 60

type UserContext = Record<string, unknown>

/**
 * Flattens the raw UserContext into the shape the chatbot's EmbedUserContext
 * pydantic model accepts (name, preferred_name, order_type, supervision_type,
 * probation_practitioner_name, probation_practitioner_phone,
 * next_appointment_date/time/location, requirements[], licence_conditions[]).
 * This is a deliberately narrow, fixed-shape channel used only to sign the
 * identity-binding JWT — it is NOT the path that carries full context to the
 * LLM prompt (that's the raw user_context body, built by buildUserContext).
 * Unknown/missing fields are omitted so the model's `extra="forbid"` validation
 * on the chatbot side accepts the payload.
 */
function flattenForEmbedContext(raw: UserContext): Record<string, unknown> {
  const personalDetails = (raw.personalDetails ?? {}) as Record<string, unknown>
  const name = (personalDetails.name ?? {}) as Record<string, unknown>
  const sentenceProgress = (raw.sentenceProgress ?? {}) as Record<string, unknown>
  const sentence = ((sentenceProgress.sentences as Array<Record<string, unknown>> | undefined) ?? [])[0] ?? {}
  const practitioner = (personalDetails.practitioner ?? {}) as Record<string, unknown>
  const practitionerName = (practitioner.name ?? {}) as Record<string, unknown>
  const practitionerTeam = (practitioner.team ?? {}) as Record<string, unknown>
  const futureAppointments = (raw.futureAppointments ?? []) as SanitizedAppointment[]
  const nextAppt = futureAppointments[0]
  const requirements = (sentence.requirements as RequirementView[] | undefined) ?? []

  const flat: Record<string, unknown> = {
    name: [name.forename, name.surname].filter(Boolean).join(' '),
    preferred_name: personalDetails.preferredName,
    order_type: sentence.type,
    probation_practitioner_name: [practitionerName.forename, practitionerName.surname].filter(Boolean).join(' '),
    probation_practitioner_phone: practitionerTeam.telephoneNumber,
    // date/timeRange/address are the same fields the appointments page shows
    // via toAppointmentCardView — see sanitizeAppointment above.
    next_appointment_date: nextAppt?.date,
    next_appointment_time: nextAppt?.timeRange,
    next_appointment_location: nextAppt?.address?.[0],
    // RequirementView.label is what the requirements page prints as the
    // section heading for each requirement (see requirements.ts toRequirementView).
    requirements: requirements
      .map(r => r.label)
      .filter((r): r is string => typeof r === 'string' && r.length > 0)
      .slice(0, 20),
  }

  // Drop keys with undefined / null / empty values so the chatbot's model
  // treats them as truly absent rather than being sent as null.
  return Object.fromEntries(Object.entries(flat).filter(([, v]) => v !== undefined && v !== null && v !== ''))
}

/**
 * Mints an HS256-signed JWT carrying the flattened embed context, matching the
 * shape the chatbot backend's _verify_pop_user_token expects (claims: `ctx`,
 * `exp`, optional `sub`). Returns undefined when no signing secret is
 * configured — the proxy then falls back to sending user_context in the body.
 */
function mintPopUserToken(raw: UserContext, userId: string, secret: string | undefined): string | undefined {
  if (!secret) return undefined
  const ctx = flattenForEmbedContext(raw)
  return jwt.sign({ sub: userId, ctx }, secret, { algorithm: 'HS256', expiresIn: POP_USER_TOKEN_TTL_SECONDS })
}

/**
 * UI-parity sanitizers.
 *
 * The chatbot must never know more about a user than the POP UI already
 * shows them on screen — otherwise the chatbot can surface fields (e.g. a
 * requirement's internal expectedStartDate/expectedEndDate) that look like a
 * discrepancy or a leak to a user comparing what they see on screen against
 * what the chatbot tells them. Each function below mirrors the exact fields
 * and conditions the corresponding page in server/routes/ renders, rather
 * than forwarding the raw upstream API response.
 *
 * This is a deliberate trade-off versus the old "forward everything"
 * design: a genuinely new upstream field won't reach the chatbot until it's
 * explicitly allowlisted here — same as it wouldn't reach a user until a
 * template is built to show it.
 */
function sanitizeAddress(address?: AddressResponse): Omit<AddressResponse, 'lastUpdatedAt'> | undefined {
  if (!address) return undefined
  const { lastUpdatedAt, ...rest } = address
  return rest
}

function sanitizePersonalDetails(personalDetails: PersonalDetailsResponse): Record<string, unknown> {
  const { name, preferredName, dateOfBirth, telephoneNumber, mobileNumber, emailAddress, mainAddress, practitioner } =
    personalDetails

  const sanitizeContact = (contact: PersonalContactResponse) => ({
    name: contact.name,
    relationship: contact.relationship,
    mobileNumber: contact.mobileNumber,
    emailAddress: contact.emailAddress,
  })

  const sanitizePractitioner = (mgr: ManagerResponse) => ({
    // formatPractitionerName is what /probation-officer uses to render the
    // officer's name — it returns undefined when the name is "unallocated"
    // so the page hides it entirely. Mirror the same filter here so the
    // chatbot doesn't see a raw name (e.g. { forename: "Unallocated" })
    // that the user's own /probation-officer page has intentionally hidden.
    name: formatPractitionerName(mgr.name) ? mgr.name : undefined,
    // Only the first office address is ever shown (see probationOfficer.ts).
    team: mgr.team
      ? {
          telephoneNumber: mgr.team.telephoneNumber,
          officeAddresses: [sanitizeAddress(mgr.team.officeAddresses?.[0])].filter(Boolean),
        }
      : undefined,
  })

  return {
    name,
    preferredName,
    dateOfBirth,
    telephoneNumber,
    mobileNumber,
    emailAddress,
    mainAddress: sanitizeAddress(mainAddress),
    emergencyContacts: personalDetails.emergencyContacts?.map(sanitizeContact),
    practitioner: practitioner ? sanitizePractitioner(practitioner) : undefined,
  }
}

// toRequirementView is the exact function requirements.ts hands to the
// requirements page (see the `res.render('pages/requirements', ...)` call).
// It already returns null for requirements the page wouldn't render at all,
// so filtering nulls here matches what the page shows.
function sanitizeSentence(sentence: SentenceResponse): Record<string, unknown> {
  return {
    type: sentence.type,
    startDate: sentence.startDate,
    expectedEndDate: sentence.expectedEndDate,
    mainOffence: sentence.mainOffence?.description ? { description: sentence.mainOffence.description } : undefined,
    requirements: (sentence.requirements ?? []).map(toRequirementView).filter((r): r is RequirementView => r !== null),
    // licenceConditions is never rendered anywhere in the UI — dropped entirely.
  }
}

function sanitizeSentenceProgress(sentenceProgress: SentenceProgressResponse): Record<string, unknown> {
  // Only sentences[0] is ever shown (see requirements.ts) — later sentences
  // in the array are invisible to the user, so they're dropped here too.
  const sentence = sentenceProgress.sentences?.[0]
  return { sentences: sentence ? [sanitizeSentence(sentence)] : [] }
}

type SanitizedAppointment = Omit<
  AppointmentCardView,
  'mapUrl' | 'calendarUrl' | 'pickUpMapUrl' | 'workMapUrl' | 'outcomeTagClasses'
>

// toAppointmentCardView is the exact function appointments.ts hands to the
// appointments page (see the `res.render('pages/appointments', ...)` call).
// Reusing it means anything the appointments page shows for an appointment
// row is what the chatbot sees too — mapUrl/calendarUrl/pickUpMapUrl/
// workMapUrl are click-through links rather than information about the user,
// and outcomeTagClasses is a CSS colour class for the status badge, so both
// are dropped here.
function sanitizeAppointment(appointment: AppointmentResponse): SanitizedAppointment {
  const { mapUrl, calendarUrl, pickUpMapUrl, workMapUrl, outcomeTagClasses, ...rest } =
    toAppointmentCardView(appointment)
  return rest
}

function sanitizeAppointments(appointments: AppointmentResponse[]): SanitizedAppointment[] {
  // Same visibility filter the appointments page applies (hides certain
  // unpaid-work project codes entirely) — an appointment the user can't see
  // on their own appointments page shouldn't be known to the chatbot either.
  return appointments.filter(shouldShowAppointment).map(sanitizeAppointment)
}

// The goals screen only ever renders these three tabs (see goals.ts, which
// filters by these exact statuses into currentGoals/futureGoals/
// achievedGoals). A goal with any other status isn't reachable from any tab,
// so it isn't "on the UI" and shouldn't be visible to the chatbot either.
const VISIBLE_GOAL_STATUSES = ['ACTIVE', 'FUTURE', 'ACHIEVED']

// toGoalView is the exact function goals.ts hands to the goals page (see
// each `.filter(...).map(toGoalView)` call feeding res.render). Reusing it
// means the chatbot's view of a goal is byte-for-byte the goals page's view.
function sanitizeSentencePlan(sentencePlan: SentencePlanResponse): { goals: GoalView[] } {
  // crn, nomis, planStatus: never shown on the goals screen — dropped.
  const visibleGoals = (sentencePlan.goals ?? []).filter(g => VISIBLE_GOAL_STATUSES.includes(g.goalStatus))
  return { goals: visibleGoals.map(toGoalView) }
}

/**
 * Builds the chatbot's user_context payload from the authenticated user's
 * profile. Driven entirely from server-side data so callers can't supply
 * or tamper with the context.
 *
 * Each source is sanitized to UI parity (see the sanitize* functions above)
 * before being included — the chatbot should only ever be able to tell a
 * user something they could already see somewhere in the POP UI.
 */
async function buildUserContext(services: Services, user: { userId: string }, crn: string): Promise<UserContext> {
  const service = services.peopleOnProbationService
  // Fetch each source independently — if one endpoint 500s or 404s, the
  // others still contribute their share of context. Previously we used
  // Promise.all which rejects the whole thing on any single failure,
  // meaning one flaky upstream call dropped ALL personalisation and the
  // chatbot fell back to its anonymous-session system prompt ("I don't
  // have access to your personal information in this session…"). Users
  // saw that even though they were signed in.
  const sources = {
    personalDetails: () => service.getPersonalDetails(crn).then(sanitizePersonalDetails),
    sentenceProgress: () => service.getSentences(crn).then(sanitizeSentenceProgress),
    futureAppointments: () => service.getFutureAppointments(crn, 0, 10).then(r => sanitizeAppointments(r.content)),
    pastAppointments: () => service.getPastAppointments(crn, 0, 10).then(r => sanitizeAppointments(r.content)),
    sentencePlan: () => service.getSentencePlan(crn).then(sanitizeSentencePlan),
  } as const

  const entries = await Promise.all(
    (Object.entries(sources) as Array<[keyof typeof sources, (typeof sources)[keyof typeof sources]]>).map(
      async ([key, fetchSource]) => {
        try {
          return [key, await fetchSource()] as const
        } catch (err) {
          logger.warn({ err, crn }, `${key} failed; continuing without it`)
          return [key, null] as const
        }
      },
    ),
  )

  const context = Object.fromEntries(entries.filter(([, value]) => value !== null))

  return {
    ...context,
    metadata: { crn, userId: user.userId },
  }
}

/**
 * Chatbot routes:
 *   POST /api/chatbot/chat — proxies the chat request to the live embed API
 *                            with X-API-Key auth, and streams the response
 *                            back as SSE. user_context is always built
 *                            server-side from the authenticated session.
 */
export default function chatbotRoutes(services: Services): Router {
  const router = Router()

  router.post('/chat', async (req: Request, res: Response) => {
    const { apiUrl } = config.popChatbot
    const { apiKey } = config.popChatbot
    const { user } = res.locals
    const crn = getSessionCrn(user)

    if (!user) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('X-Accel-Buffering', 'no')

    const send = (payload: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`)
    }

    if (!config.features.chatbot || !apiUrl || !apiKey) {
      send({ type: 'error', text: 'Chatbot service is not configured' })
      res.end()
      return
    }

    // Only forward fields the embed API expects. user_context is always
    // built server-side from the authenticated session — never trusted
    // from the request body. session_token is echoed straight through
    // from the widget; the backend uses it to prove the caller owns the
    // conversation on any follow-up (same-conversation) request.
    const { message, conversation_id: conversationId, session_token: sessionToken } = req.body ?? {}
    let userContext: UserContext | undefined
    if (crn) {
      try {
        userContext = await buildUserContext(services, user, crn)
      } catch (err) {
        logger.warn({ err }, 'Could not build user context for chat; continuing without it')
      }
    }
    const upstreamBody = {
      message,
      conversation_id: conversationId,
      session_token: sessionToken,
      user_context: userContext,
    }

    // When POP_CHATBOT_USER_TOKEN_SECRET is set, sign a short-lived JWT
    // carrying the flattened embed context. The chatbot backend requires
    // this whenever its POP_USER_TOKEN_SECRET is set, so a leaked API
    // key alone can't be used to fabricate a user identity. When the
    // secret isn't set, the token header is omitted and the chatbot
    // falls back to trusting the body user_context — matches today's
    // behaviour.
    const popUserToken = userContext
      ? mintPopUserToken(userContext, user.userId, config.popChatbot.userTokenSecret)
      : undefined

    // Abort the upstream call if it goes idle, or if the client disconnects.
    // The timer is reset on every chunk received from upstream (see the
    // reader loop below) — so this bounds silence between chunks, not the
    // total streaming duration.
    const controller = new AbortController()
    let idleTimer: NodeJS.Timeout = setTimeout(() => controller.abort(), UPSTREAM_INACTIVITY_TIMEOUT_MS)
    const resetIdleTimer = () => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => controller.abort(), UPSTREAM_INACTIVITY_TIMEOUT_MS)
    }
    req.on('close', () => {
      clearTimeout(idleTimer)
      controller.abort()
    })

    // Route to the streaming variant of the embed API. The backend at
    // /chatbot/chat-embed-stream already emits properly-formatted
    // `data: {...}\n\n` SSE frames matching this route's own SSE contract,
    // so we forward the response body straight through with no wrapping.
    // Deployment config (POP_CHATBOT_API_URL in the values files) is
    // expected to point directly at the streaming endpoint.
    const upstreamHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      Accept: 'text/event-stream',
    }
    if (popUserToken) {
      upstreamHeaders['X-POP-User-Token'] = popUserToken
    }

    try {
      const upstream = await fetch(apiUrl, {
        method: 'POST',
        headers: upstreamHeaders,
        body: JSON.stringify(upstreamBody),
        signal: controller.signal,
      })

      if (!upstream.ok) {
        const text = await upstream.text().catch(() => '')
        logger.warn(
          { status: upstream.status, statusText: upstream.statusText, body: text.slice(0, 1000) },
          'Chatbot upstream returned a non-2xx response',
        )
        send({ type: 'error', text: 'Chatbot service unavailable' })
        res.end()
        return
      }

      if (!upstream.body) {
        send({ type: 'error', text: 'Chatbot service returned no response body' })
        res.end()
        return
      }

      // Pipe the SSE frames from the backend straight through to the widget.
      // Reading in chunks (rather than awaiting the whole body) preserves
      // token-by-token streaming end-to-end. Awaiting sequentially inside
      // the loop is exactly the right pattern here — we can't read chunk
      // N+1 before chunk N — so disable the no-await-in-loop rule locally.
      const reader = upstream.body.getReader()
      try {
        for (;;) {
          // eslint-disable-next-line no-await-in-loop
          const { done, value } = await reader.read()
          if (done) break
          if (value) {
            // Upstream is alive — push the idle-abort window out again.
            resetIdleTimer()
            res.write(value)
          }
        }
      } finally {
        reader.releaseLock()
        if (!res.writableEnded) res.end()
      }
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') {
        logger.warn('Chatbot proxy aborted (timeout or client disconnect)')
        if (!res.writableEnded) {
          send({ type: 'error', text: 'Chatbot request timed out' })
          res.end()
        }
        return
      }
      logger.warn({ err }, 'Chatbot proxy failed')
      // Guard the send: we may have already streamed the whole response
      // out and called res.end() in the reader's finally block — writing
      // to a finished response throws ERR_STREAM_WRITE_AFTER_END.
      if (!res.writableEnded) {
        send({ type: 'error', text: 'Chatbot service unavailable' })
        res.end()
      }
    } finally {
      clearTimeout(idleTimer)
    }
  })

  /**
   * POST /api/chatbot/chat/feedback — proxies widget thumbs up/down to the
   * chatbot backend's /chatbot/feedback-embed endpoint. Widget calls
   * `${apiBaseUrl}/feedback` where apiBaseUrl is /api/chatbot/chat, so the
   * request lands here.
   */
  router.post('/chat/feedback', async (req: Request, res: Response) => {
    const { apiUrl, apiKey, feedbackUrl: configuredFeedbackUrl } = config.popChatbot
    const { user } = res.locals

    if (!user) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }
    if (!config.features.chatbot || !apiUrl || !apiKey) {
      res.status(503).json({ error: 'Chatbot service is not configured' })
      return
    }

    // Prefer an explicit POP_CHATBOT_FEEDBACK_URL. Fall back to deriving
    // from POP_CHATBOT_API_URL by swapping the endpoint path (works while
    // both endpoints live at the same base path). If derivation fails
    // (URL doesn't end with /chat-embed-stream) we 503 rather than
    // silently POSTing to the wrong place — otherwise chat would keep
    // working while feedback broke, and the chat smoke test wouldn't
    // catch it.
    let feedbackUrl = configuredFeedbackUrl
    if (!feedbackUrl) {
      const derived = apiUrl.replace(/\/chat-embed-stream(\/?)$/, '/feedback-embed$1')
      if (derived === apiUrl) {
        logger.warn(
          { apiUrl },
          'POP_CHATBOT_API_URL does not end with /chat-embed-stream; set POP_CHATBOT_FEEDBACK_URL explicitly',
        )
        res.status(503).json({ error: 'Chatbot feedback endpoint is not configured' })
        return
      }
      feedbackUrl = derived
    }

    // Only forward the fields the embed feedback endpoint expects. _csrf and
    // any other body fields are dropped. session_token proves the caller
    // owns the conversation — the backend requires it whenever
    // conversation_id is set (matching the chat flow) so that a leaked
    // X-API-Key alone can't be used to poison arbitrary conversations'
    // feedback aggregates.
    const {
      message_id: messageId,
      feedback_type: feedbackType,
      feedback_value: feedbackValue,
      conversation_id: conversationId,
      session_token: sessionToken,
    } = req.body ?? {}

    if (!messageId || !feedbackType) {
      res.status(400).json({ error: 'message_id and feedback_type are required' })
      return
    }

    try {
      const upstream = await fetch(feedbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          message_id: messageId,
          feedback_type: feedbackType,
          feedback_value: feedbackValue ?? null,
          conversation_id: conversationId,
          session_token: sessionToken,
        }),
      })

      if (!upstream.ok) {
        const text = await upstream.text().catch(() => '')
        logger.warn(
          { status: upstream.status, body: text.slice(0, 500) },
          'Chatbot feedback upstream returned a non-2xx response',
        )
        res.status(502).json({ error: 'Chatbot feedback service unavailable' })
        return
      }

      res.status(200).json({ message: 'Feedback recorded' })
    } catch (err) {
      logger.warn({ err }, 'Chatbot feedback proxy failed')
      res.status(502).json({ error: 'Chatbot feedback service unavailable' })
    }
  })

  return router
}
