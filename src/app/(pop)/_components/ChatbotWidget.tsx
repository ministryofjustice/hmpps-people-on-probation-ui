'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import {
  getPopChatbotConversationStorageKey,
  type PopChatbotConfig,
} from '@/lib/popChatbot'

type ChatbotWidgetProps = {
  crn: string
  chatbot: PopChatbotConfig
  onClose: () => void
  onReset: () => void
}

type ChatMessage = {
  sender: 'assistant' | 'user'
  text: string
}

const SUGGESTED_QUESTIONS = [
  'What happens at my first appointment?',
  'Can I travel abroad on probation?',
  'What are my reporting requirements?',
]

export default function ChatbotWidget({ crn, chatbot, onClose, onReset }: ChatbotWidgetProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [hasLoadedConversation, setHasLoadedConversation] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [userContext, setUserContext] = useState<Record<string, unknown> | null>(null)
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const hasBootstrappedRef = useRef(false)
  const storageKey = getPopChatbotConversationStorageKey(crn)

  // Fetch user_context once when the widget mounts; reuse on every message so
  // conversations survive backend pod restarts (which wipe the in-memory cache).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/pop-chat-context?crn=${encodeURIComponent(crn)}`)
        if (!res.ok) return
        const ctx = (await res.json()) as Record<string, unknown>
        if (!cancelled) setUserContext(ctx)
      } catch {
        // Silently fall back to no user_context — widget still works, less personalised.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [crn])

  useEffect(() => {
    const rawConversation = window.localStorage.getItem(storageKey)
    if (!rawConversation) {
      setHasLoadedConversation(true)
      return
    }

    try {
      const savedConversation = JSON.parse(rawConversation) as {
        conversationId: string | null
        messages: ChatMessage[]
      }

      setConversationId(savedConversation.conversationId)
      setMessages(savedConversation.messages)
      hasBootstrappedRef.current = savedConversation.messages.length > 0
      if (savedConversation.messages.some(m => m.sender === 'user')) {
        setShowSuggestions(false)
      }
    } catch {
      window.localStorage.removeItem(storageKey)
    } finally {
      setHasLoadedConversation(true)
    }
  }, [storageKey])

  useEffect(() => {
    if (messages.length === 0 && !conversationId) return

    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        conversationId: conversationId,
        messages,
      }),
    )
  }, [conversationId, messages, storageKey])

  const sendMessage = async (message: string, sender: 'user' | 'assistant-seed' = 'user', overrideConversationId?: string | null) => {
    const trimmedMessage = message.trim()
    if (!trimmedMessage || isLoading) return

    if (sender === 'user') {
      setMessages(current => [...current, { sender: 'user', text: trimmedMessage }])
    }
    if (sender !== 'assistant-seed') {
      setShowSuggestions(false)
    }

    setIsLoading(true)
    setErrorMessage(null)

    const currentConversationId = overrideConversationId !== undefined ? overrideConversationId : conversationId



    try {
      const requestBody: Record<string, unknown> = {
        message: trimmedMessage,
        conversationId: currentConversationId,
      }

      // Send user_context with every message. Backend caches it per
      // conversation, so this is cheap; sending each time keeps conversations
      // working through backend pod restarts that wipe the in-memory cache.
      // Use the on-mount-fetched value when available; otherwise fetch inline
      // (covers the race where the bootstrap message fires before mount fetch
      // resolves).
      let contextToSend = userContext
      if (!contextToSend) {
        try {
          const res = await fetch(`/api/pop-chat-context?crn=${encodeURIComponent(crn)}`)
          if (res.ok) {
            contextToSend = (await res.json()) as Record<string, unknown>
            setUserContext(contextToSend)
          }
        } catch {
          // Silently fall back to no user_context.
        }
      }
      if (contextToSend) {
        requestBody.user_context = contextToSend
      }

      const response = await fetch('/api/pop-chatbot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        throw new Error('Failed to send message')
      }

      const data = (await response.json()) as {
        response: string
        conversationId: string
      }

      setConversationId(data.conversationId)
      setMessages(current => [...current, { sender: 'assistant', text: data.response }])
    } catch {
      setErrorMessage('Fred is unavailable at the moment. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!hasLoadedConversation) return
    if (!hasBootstrappedRef.current && messages.length === 0 && !conversationId && !isLoading) {
      hasBootstrappedRef.current = true
      void sendMessage('hi', 'assistant-seed', null)
    }
  }, [conversationId, hasLoadedConversation, isLoading, messages.length])

  useEffect(() => {
    if (!messagesRef.current) return
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight
  }, [messages, errorMessage, isLoading])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextMessage = inputValue.trim()
    if (!nextMessage) return

    setInputValue('')
    await sendMessage(nextMessage)
  }

  const handleReset = () => {
    window.localStorage.removeItem(storageKey)
    setMessages([])
    setConversationId(null)
    setInputValue('')
    setErrorMessage(null)
    setShowSuggestions(true)
    hasBootstrappedRef.current = false
    onReset()
    // Start a fresh conversation immediately
    void sendMessage('hi', 'assistant-seed', null)
  }

  return (
    <div className="pop-chatbot">
      <section className="pop-chatbot__panel" aria-label={chatbot.title}>
        <div className="pop-chatbot__header">
          <div>
            <h2 className="pop-chatbot__title">Fred</h2>
            <span className="pop-chatbot__subtitle">AI Probation Assistant</span>
          </div>
          <div className="pop-chatbot__header-actions">
            <button type="button" className="pop-chatbot__reset-button" onClick={handleReset} aria-label="Reset conversation">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
          </div>
        </div>

        <div ref={messagesRef} className="pop-chatbot__messages">
          {messages.map((message, index) => (
            <div
              key={`${message.sender}-${index}`}
              className={`pop-chatbot__message pop-chatbot__message--${message.sender}`}
            >
              {message.text}
            </div>
          ))}
          {showSuggestions && messages.length > 0 && !isLoading ? (
            <div className="pop-chatbot__suggestions">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="pop-chatbot__suggestion"
                  onClick={() => {
                    setShowSuggestions(false)
                    setInputValue('')
                    void sendMessage(q)
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          ) : null}
          {isLoading ? <div className="pop-chatbot__status">Fred is typing...</div> : null}
          {errorMessage ? <div className="pop-chatbot__status pop-chatbot__status--error">{errorMessage}</div> : null}
        </div>

        <form className="pop-chatbot__composer" onSubmit={handleSubmit}>
          <input
            className="pop-chatbot__input"
            type="text"
            placeholder={chatbot.inputPlaceholder}
            aria-label={chatbot.inputPlaceholder}
            value={inputValue}
            onChange={event => setInputValue(event.target.value)}
          />
          <button type="submit" className="pop-chatbot__send" disabled={isLoading || !inputValue.trim()} aria-label="Send">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </form>
      </section>
    </div>
  )
}
