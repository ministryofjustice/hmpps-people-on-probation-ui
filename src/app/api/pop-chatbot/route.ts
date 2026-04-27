import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const chatbotApiUrl =
  process.env.POP_CHATBOT_API_URL ?? 'https://probationchatbot-production.up.railway.app/chatbot/chat-embed'
const chatbotApiKey = process.env.POP_CHATBOT_API_KEY

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>

    const message = (body.message as string)?.trim()
    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const upstreamBody: Record<string, unknown> = {
      
      message,
    }

    // Copy user_context directly if provided
    if (body.user_context) {
      console.log('Including user_context in chatbot request');
      upstreamBody.user_context = body.user_context
      upstreamBody.supervision_type = 'community_order'
    }

    // Convert conversationId to conversation_id for upstream API
    if (body.conversationId) {
      upstreamBody.conversation_id = body.conversationId
    }

    const upstreamResponse = await fetch(chatbotApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': chatbotApiKey,
      },
      body: JSON.stringify(upstreamBody),
      cache: 'no-store',
    })

    if (!upstreamResponse.ok) {
      return NextResponse.json({ error: 'Chatbot service unavailable' }, { status: 502 })
    }

    const data = (await upstreamResponse.json()) as {
      response: string
      conversation_id: string
      sensitive_content_detected: boolean
    }

    return NextResponse.json({
      response: data.response,
      conversationId: data.conversation_id,
      sensitiveContentDetected: data.sensitive_content_detected,
    })
  } catch {
    return NextResponse.json({ error: 'Chatbot service unavailable' }, { status: 502 })
  }
}
