import { Router, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import config from '../config'
import logger from '../../logger'
import type { Services } from '../services'

// Inactivity-only timeout. Not a cap on the whole streamed response —
// legitimate long LLM answers can easily take longer than 30s to fully
// stream. We reset this timer on every chunk we receive; if the upstream
// stops sending for this long, we abort and surface an error frame.
const UPSTREAM_INACTIVITY_TIMEOUT_MS = 30_000
const POP_USER_TOKEN_TTL_SECONDS = 5 * 60

type UserContext = Record<string, unknown>

/**
 * Flattens the rich UserContext into the shape the chatbot's EmbedUserContext
 * pydantic model accepts (name, preferred_name, order_type, supervision_type,
 * probation_practitioner_name, probation_practitioner_phone,
 * next_appointment_date/time/location, requirements[], licence_conditions[]).
 * Unknown/missing fields are omitted so the model's `extra="forbid"` validation
 * on the chatbot side accepts the payload.
 */
function flattenForEmbedContext(rich: UserContext): Record<string, unknown> {
  const personalDetails = (rich.personalDetails ?? {}) as Record<string, unknown>
  const orderDetails = (rich.orderDetails ?? {}) as Record<string, unknown>
  const practitioner = (rich.probationPractitioner ?? {}) as Record<string, unknown>
  const appointments = ((rich.appointments as Record<string, unknown>)?.upcoming ?? []) as Array<
    Record<string, unknown>
  >
  const nextAppt = appointments[0] ?? {}
  const requirements = (orderDetails.requirements as Array<Record<string, unknown>> | undefined) ?? []

  const flat: Record<string, unknown> = {
    name: personalDetails.name,
    preferred_name: personalDetails.preferredName,
    order_type: orderDetails.orderType,
    probation_practitioner_name: practitioner.name,
    probation_practitioner_phone: practitioner.phone,
    next_appointment_date: nextAppt.date,
    next_appointment_time: nextAppt.time,
    next_appointment_location: nextAppt.location,
    requirements: requirements
      .map(r => r.requirement as string | undefined)
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
function mintPopUserToken(rich: UserContext, userId: string, secret: string | undefined): string | undefined {
  if (!secret) return undefined
  const ctx = flattenForEmbedContext(rich)
  return jwt.sign({ sub: userId, ctx }, secret, { algorithm: 'HS256', expiresIn: POP_USER_TOKEN_TTL_SECONDS })
}

/**
 * Builds the chatbot's user_context payload from the authenticated user's
 * profile. Driven entirely from server-side data so callers can't supply
 * or tamper with the context.
 */
async function buildUserContext(services: Services, user: { userId: string }, crn: string): Promise<UserContext> {
  const service = services.peopleOnProbationService
  const [personalDetails, sentenceProgress, futureAppointments] = await Promise.all([
    service.getPersonalDetails(crn),
    service.getSentences(crn),
    service.getFutureAppointments(crn, 0, 10),
  ])

  const sentence = sentenceProgress.sentences?.[0]
  const rar = (sentence?.requirements ?? []).find(
    r => r.mainCategory?.description === 'Rehabilitation Activity Requirement',
  )
  const upw = (sentence?.requirements ?? []).find(r => r.mainCategory?.description === 'Unpaid Work')
  const upwNext = futureAppointments.content.find(a => a.type === 'Unpaid Work')
  const emergency = personalDetails.emergencyContacts?.[0]
  const { practitioner } = personalDetails
  const officeAddress = practitioner?.team?.officeAddresses?.[0]

  return {
    personalDetails: {
      name: [personalDetails.name?.forename, personalDetails.name?.surname].filter(Boolean).join(' '),
      preferredName: personalDetails.preferredName,
      dateOfBirth: personalDetails.dateOfBirth,
      userId: user.userId,
    },
    contactDetails: {
      address: [
        [personalDetails.mainAddress?.houseNumber, personalDetails.mainAddress?.street].filter(Boolean).join(' '),
        personalDetails.mainAddress?.town,
        personalDetails.mainAddress?.postcode,
      ]
        .filter(Boolean)
        .join('\n'),
      phone: personalDetails.telephoneNumber,
      mobile: personalDetails.mobileNumber,
      email: personalDetails.emailAddress,
    },
    emergencyContact: emergency
      ? {
          name: [emergency.name?.forename, emergency.name?.surname].filter(Boolean).join(' '),
          relationship: emergency.relationship,
          phone: emergency.mobileNumber,
        }
      : null,
    probationPractitioner: practitioner
      ? {
          name: [practitioner.name?.forename, practitioner.name?.surname].filter(Boolean).join(' '),
          phone: practitioner.team?.telephoneNumber,
          officeAddress: [
            officeAddress?.buildingName,
            officeAddress?.street,
            officeAddress?.town,
            officeAddress?.postcode,
          ]
            .filter(Boolean)
            .join('\n'),
        }
      : null,
    orderDetails: {
      orderType: sentence?.type,
      startDate: sentence?.startDate,
      requirementsCompletionDate: sentence?.expectedEndDate,
      requirements: (sentence?.requirements ?? []).map(r => ({
        category: r.mainCategory?.description,
        requirement: r.subCategory?.description,
      })),
    },
    rehabilitationActivityRequirement: rar
      ? [
          {
            type: rar.mainCategory?.description,
            activity: rar.subCategory?.description,
            daysCompleted: rar.completed,
            daysRequired: rar.required,
          },
        ]
      : [],
    unpaidWork: upw
      ? {
          totalCompletedHours: upw.completed,
          hoursRequired: upw.required,
          percentCompleted: upw.required && upw.completed ? Math.round((upw.completed / upw.required) * 100) : 0,
          breakdown: [
            {
              title: 'Unpaid Work',
              completed: upw.completed,
              required: upw.required,
            },
          ],
          nextAppointment: upwNext
            ? {
                title: upwNext.type,
                date: upwNext.date,
                time: upwNext.startTime,
                location: upwNext.location?.buildingName,
              }
            : null,
        }
      : null,
    appointments: {
      upcoming: futureAppointments.content
        .filter(a => a.type !== 'Unpaid Work')
        .map(a => ({
          date: a.date,
          time: a.startTime,
          location: a.location?.buildingName,
          title: a.type,
        })),
    },
    metadata: {
      crn,
    },
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
    const crn = user?.registeredUserDetails?.personReference

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

    if (!apiUrl || !apiKey) {
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
    const { apiUrl, apiKey } = config.popChatbot
    const { user } = res.locals

    if (!user) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }
    if (!apiUrl || !apiKey) {
      res.status(503).json({ error: 'Chatbot service is not configured' })
      return
    }

    // Derive feedback URL from the chat streaming URL by swapping the
    // endpoint path. Keeps env-var footprint at one URL rather than two.
    const feedbackUrl = apiUrl.replace(/\/chat-embed-stream(\/?)$/, '/feedback-embed$1')
    if (feedbackUrl === apiUrl) {
      logger.warn(
        { apiUrl },
        'POP_CHATBOT_API_URL does not end with /chat-embed-stream; unable to derive feedback URL',
      )
      res.status(503).json({ error: 'Chatbot feedback endpoint is not configured' })
      return
    }

    // Only forward the fields the embed feedback endpoint expects. _csrf and
    // any other body fields are dropped.
    const {
      message_id: messageId,
      feedback_type: feedbackType,
      feedback_value: feedbackValue,
      conversation_id: conversationId,
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
