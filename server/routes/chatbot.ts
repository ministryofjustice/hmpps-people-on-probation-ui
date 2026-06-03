import { Router, Request, Response } from 'express'
import config from '../config'
import logger from '../../logger'
import type { Services } from '../services'

/**
 * Chatbot routes:
 *   GET  /api/chatbot/user-context  — returns the authenticated user's profile
 *                                     as the chatbot's user_context payload
 *   POST /api/chatbot/chat          — proxies the chat request to the live
 *                                     embed API with X-API-Key auth, and
 *                                     streams the response back as SSE
 */
export default function chatbotRoutes(services: Services): Router {
  const router = Router()

  router.get('/user-context', async (_req: Request, res: Response) => {
    const { user } = res.locals
    const crn = user?.registeredUserDetails?.personReference
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }
    if (!crn) {
      res.json(null)
      return
    }

    try {
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

      res.json({
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
      })
    } catch (err) {
      logger.warn({ err }, 'Failed to build chatbot user context')
      res.json(null)
    }
  })

  router.post('/chat', async (req: Request, res: Response) => {
    const { apiUrl } = config.popChatbot
    const { apiKey } = config.popChatbot

    if (!res.locals.user) {
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

    // Forward only the fields the embed API expects — never proxy
    // unknown fields (e.g. the _csrf token sent for our own CSRF check).
    const { message, conversation_id: conversationId, user_context: userContext } = req.body ?? {}
    const upstreamBody = { message, conversation_id: conversationId, user_context: userContext }

    try {
      const upstream = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify(upstreamBody),
      })

      if (!upstream.ok) {
        const text = await upstream.text().catch(() => '')
        send({ type: 'error', text: `HTTP ${upstream.status}: ${text || upstream.statusText}` })
        res.end()
        return
      }

      const data = (await upstream.json()) as {
        response?: string
        conversation_id?: string
        sensitive_content_detected?: boolean
        sources?: string[]
      }
      const responseText = data.response ?? ''

      if (data.sensitive_content_detected) {
        send({ type: 'blocked', text: responseText })
      } else {
        send({ type: 'chunk', text: responseText })
      }
      send({
        type: 'done',
        conversation_id: data.conversation_id,
        sources: data.sources ?? [],
        final_text: responseText,
      })
      res.end()
    } catch (err) {
      logger.warn({ err }, 'Chatbot proxy failed')
      send({ type: 'error', text: 'Chatbot service unavailable' })
      res.end()
    }
  })

  return router
}
