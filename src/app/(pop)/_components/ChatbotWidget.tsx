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

export default function ChatbotWidget({ crn, chatbot, onClose, onReset }: ChatbotWidgetProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [hasLoadedConversation, setHasLoadedConversation] = useState(false)
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const hasBootstrappedRef = useRef(false)
  const storageKey = getPopChatbotConversationStorageKey(crn)

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
        conversationId,
        messages,
      }),
    )
  }, [conversationId, messages, storageKey])

  const sendMessage = async (message: string, sender: 'user' | 'assistant-seed' = 'user') => {
    const trimmedMessage = message.trim()
    if (!trimmedMessage || isLoading) return

    if (sender === 'user') {
      setMessages(current => [...current, { sender: 'user', text: trimmedMessage }])
    }

    setIsLoading(true)
    setErrorMessage(null)

    try {
      const response = await fetch('/api/pop-chatbot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: trimmedMessage,
          conversationId,
        }),
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
      void sendMessage('hi', 'assistant-seed')
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
    hasBootstrappedRef.current = false
    onReset()
  }

  return (
    <div className="pop-chatbot">
      <section className="pop-chatbot__panel" aria-label={chatbot.title}>
        <div className="pop-chatbot__header">
          <h2 className="pop-chatbot__title">{chatbot.title}</h2>
          <div className="pop-chatbot__header-actions">
            <button type="button" className="pop-chatbot__reset-button" onClick={handleReset}>
              {chatbot.resetLabel}
            </button>
            <button type="button" className="pop-chatbot__icon-button" aria-label="Close chatbot" onClick={onClose}>
              x
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
          <button type="submit" className="pop-chatbot__send" disabled={isLoading || !inputValue.trim()}>
            {chatbot.sendLabel}
          </button>
        </form>
      </section>

      <button type="button" className="pop-chatbot__close-pill" onClick={onClose}>
        {chatbot.closeLabel}
      </button>
    </div>
  )
}
