import { Router, Request, Response } from 'express'
import config from '../config'
import logger from '../../logger'
import type { Services } from '../services'

const UPSTREAM_TIMEOUT_MS = 30_000

type UserContext = Record<string, unknown>

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
  const rar = (sentence?.requirements ?? []).find(r => r.type === 'Rehabilitation Activity Requirement')
  const upw = (sentence?.requirements ?? []).find(r => r.type === 'Unpaid Work')
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
          phone: practitioner.telephoneNumber,
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
        category: r.type,
        requirement: r.description,
      })),
    },
    rehabilitationActivityRequirement: rar
      ? [
          {
            type: rar.type,
            activity: rar.description,
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
                title: upwNext.description,
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
    // from the request body.
    const { message, conversation_id: conversationId } = req.body ?? {}
    let userContext: UserContext | undefined
    if (crn) {
      try {
        userContext = await buildUserContext(services, user, crn)
      } catch (err) {
        logger.warn({ err }, 'Could not build user context for chat; continuing without it')
      }
    }
    const upstreamBody = { message, conversation_id: conversationId, user_context: userContext }

    // Abort the upstream call if it hangs, or if the client disconnects.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
    req.on('close', () => controller.abort())

    // Route to the streaming variant of the embed API. The backend at
    // /chatbot/chat-embed-stream already emits properly-formatted
    // `data: {...}\n\n` SSE frames matching this route's own SSE contract,
    // so we forward the response body straight through with no wrapping.
    // Deployment config (POP_CHATBOT_API_URL in the values files) is
    // expected to point directly at the streaming endpoint.
    try {
      const upstream = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
          Accept: 'text/event-stream',
        },
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
      // token-by-token streaming end-to-end.
      const reader = upstream.body.getReader()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) res.write(value)
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
      send({ type: 'error', text: 'Chatbot service unavailable' })
      res.end()
    } finally {
      clearTimeout(timer)
    }
  })

  return router
}
