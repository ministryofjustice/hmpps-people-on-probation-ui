import { Router } from 'express'

export default function chatbotRoutes(): Router {
  const router = Router()

  router.post('/chatbot/send', async (req, res) => {
    // Read env at request time so the module can be imported by build steps
    // / tests without throwing. The vars must be present in the deployed env.
    const chatbotApiUrl = process.env.CHATBOT_API_URL
    const chatbotApiKey = process.env.CHATBOT_API_KEY
    if (!chatbotApiUrl || !chatbotApiKey) {
      return res.status(503).json({ error: 'Chatbot service is not configured' })
    }

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

      const response = await fetch(`${chatbotApiUrl}/chatbot/chat-embed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': chatbotApiKey,
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
