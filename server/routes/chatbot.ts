import { Router } from 'express'

const CHATBOT_API_URL = process.env.CHATBOT_API_URL
const CHATBOT_API_KEY = process.env.CHATBOT_API_KEY

if (!CHATBOT_API_URL || !CHATBOT_API_KEY) {
  throw new Error('CHATBOT_API_URL and CHATBOT_API_KEY must be set')
}

export default function chatbotRoutes(): Router {
  const router = Router()

  router.post('/chatbot/send', async (req, res) => {
    const { message, conversationId, userContext } = req.body

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' })
    }

    try {
      const body: Record<string, unknown> = { message }
      if (conversationId) {
        body.conversation_id = conversationId
      }
      if (userContext && typeof userContext === 'object') {
        body.user_context = userContext
      }

      const response = await fetch(`${CHATBOT_API_URL}/chatbot/chat-embed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': CHATBOT_API_KEY,
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        return res.status(response.status).json({ error: 'Chatbot API error' })
      }

      const data = await response.json()
      return res.json(data)
    } catch {
      return res.status(500).json({ error: 'Failed to reach chatbot service' })
    }
  })

  return router
}
