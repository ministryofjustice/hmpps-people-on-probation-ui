// Minimal same-origin API client for the chatbot widget.
// The server-side proxy at `${apiBaseUrl}` forwards to the live embed API and
// returns an SSE stream the widget can consume.

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  async chatWithAIStream(
    message: string,
    onChunk: (text: string) => void,
    onDone: (data: { conversation_id: string; sources?: string[]; final_text?: string }) => void,
    onError: (error: string) => void,
    conversationId?: string,
    domain?: string,
  ): Promise<void> {
    const csrfToken = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? ''

    // user_context is intentionally NOT sent — the server builds it from the
    // authenticated session so a tampered client can't impersonate another user.
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        conversation_id: conversationId,
        domain,
        _csrf: csrfToken,
      }),
    })

    if (!response.ok || !response.body) {
      onError(`HTTP ${response.status}`)
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    // Streaming SSE requires sequential reads; await-in-loop is the right
    // pattern here, and skipping non-data lines via continue keeps the
    // parser readable.
    /* eslint-disable no-await-in-loop, no-continue */
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''
      for (const part of parts) {
        const line = part.trim()
        if (!line.startsWith('data: ')) continue
        try {
          const data = JSON.parse(line.slice(6))
          if (data.type === 'chunk') onChunk(data.text)
          else if (data.type === 'done') onDone(data)
          else if (data.type === 'error' || data.type === 'blocked') onError(data.text ?? 'Error')
        } catch {
          // malformed line, skip
        }
      }
    }
    /* eslint-enable no-await-in-loop, no-continue */
  }

  async sendFeedback(_messageId: string, _feedbackType: string, _value: unknown): Promise<void> {
    // Embed API doesn't expose feedback yet — silently no-op so the UI stays consistent.
  }

  async clearConversation(_conversationId: string): Promise<void> {
    // Embed API doesn't expose clear-conversation — handled client-side via state reset.
  }
}

const createApiClient = (baseUrl: string) => new ApiClient(baseUrl)

export default createApiClient
