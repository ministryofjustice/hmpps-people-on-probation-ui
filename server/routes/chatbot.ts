import { Router } from 'express'

const CHATBOT_API_URL = process.env.CHATBOT_API_URL || 'https://probationchatbot-production.up.railway.app'
const CHATBOT_API_KEY = process.env.CHATBOT_API_KEY || 'dwQPxPfVcdV4HKFg2doCiPh-EFZCESJLwu2Md2KMLqQ'

export default function chatbotRoutes(): Router {
  const router = Router()

  router.post('/chatbot/send', async (req, res) => {
    const { message, conversationId } = req.body

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' })
    }

    try {
      const body: Record<string, string> = { message }
      if (conversationId) {
        body.conversation_id = conversationId
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
