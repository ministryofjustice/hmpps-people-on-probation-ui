import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import FloatingChatbot from './chatbot/FloatingChatbot'
import popConfig from './chatbot/config'
import '../styles/chatbot.css'

function ChatbotRoot() {
  const [userContext, setUserContext] = useState<Record<string, unknown> | null>(null)

  // Lazily fetch the user's context via same-origin authenticated XHR so PII
  // doesn't end up in the rendered HTML source.
  useEffect(() => {
    let cancelled = false
    fetch('/api/chatbot/user-context', { credentials: 'same-origin' })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!cancelled) setUserContext(data ?? null)
      })
      .catch(() => {
        if (!cancelled) setUserContext(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <FloatingChatbot
      apiBaseUrl="/api/chatbot/chat"
      domain="pop"
      config={popConfig}
      userContext={userContext}
    />
  )
}

const root = document.getElementById('chatbot-root')
if (root) {
  createRoot(root).render(<ChatbotRoot />)
}
