'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import ChatbotWidget from './ChatbotWidget'
import {
  getPopChatbotConfig,
  getPopChatbotConversationStorageKey,
  getPopChatbotStorageKey,
} from '@/lib/popChatbot'

const defaultCrn = 'X975562'

export default function GlobalChatbotWidget() {
  const searchParams = useSearchParams()
  const crnParam = searchParams.get('crn')?.trim()
  const crn = crnParam || defaultCrn
  const chatbot = useMemo(() => getPopChatbotConfig(crn), [crn])
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!crnParam) {
      // eslint-disable-next-line no-console
      console.warn(`GlobalChatbotWidget: no crn search param; falling back to ${defaultCrn}`)
    }
  }, [crnParam])

  // Sync open/close state with localStorage so it persists across navigation.
  useEffect(() => {
    if (!chatbot) {
      setIsOpen(false)
      return
    }
    setIsOpen(window.localStorage.getItem(getPopChatbotStorageKey(crn)) === 'true')
  }, [chatbot, crn])

  // Other parts of the app open/close the chatbot via custom events.
  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ crn?: string }>).detail
      if (detail?.crn !== crn) return
      window.localStorage.setItem(getPopChatbotStorageKey(crn), 'true')
      setIsOpen(true)
    }

    const handleClose = (event: Event) => {
      const detail = (event as CustomEvent<{ crn?: string }>).detail
      if (detail?.crn !== crn) return
      window.localStorage.setItem(getPopChatbotStorageKey(crn), 'false')
      setIsOpen(false)
    }

    window.addEventListener('pop-chatbot:open', handleOpen as EventListener)
    window.addEventListener('pop-chatbot:close', handleClose as EventListener)

    return () => {
      window.removeEventListener('pop-chatbot:open', handleOpen as EventListener)
      window.removeEventListener('pop-chatbot:close', handleClose as EventListener)
    }
  }, [crn])

  if (!chatbot) {
    // CRN doesn't have a chatbot configured — render nothing.
    return null
  }

  const handleToggle = () => {
    const next = !isOpen
    window.localStorage.setItem(getPopChatbotStorageKey(crn), next ? 'true' : 'false')
    window.dispatchEvent(
      new CustomEvent(next ? 'pop-chatbot:open' : 'pop-chatbot:close', { detail: { crn } }),
    )
    setIsOpen(next)
  }

  const handleClose = () => {
    window.localStorage.setItem(getPopChatbotStorageKey(crn), 'false')
    window.dispatchEvent(new CustomEvent('pop-chatbot:close', { detail: { crn } }))
    setIsOpen(false)
  }

  const handleReset = () => {
    window.localStorage.removeItem(getPopChatbotConversationStorageKey(crn))
  }

  return (
    <div className="pop-chatbot-sticky">
      {isOpen && (
        <ChatbotWidget crn={crn} chatbot={chatbot} onClose={handleClose} onReset={handleReset} />
      )}
      <button
        type="button"
        className="pop-chatbot-sticky__toggle"
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
        aria-expanded={isOpen}
        onClick={handleToggle}
      >
        {isOpen ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>
    </div>
  )
}
