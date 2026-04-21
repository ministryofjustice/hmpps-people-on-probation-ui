'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import ChatbotWidget from './ChatbotWidget'

const defaultCrn = 'X975562'

const chatbotConfig = {
  title: 'Fred',
  closeLabel: 'Close',
  resetLabel: 'Reset',
  inputPlaceholder: 'Ask a question...',
  sendLabel: 'Send',
}

export default function GlobalChatbotWidget() {
  const searchParams = useSearchParams()
  const crn = searchParams.get('crn')?.trim() || defaultCrn
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="pop-chatbot-sticky">
      {isOpen && (
        <ChatbotWidget
          crn={crn}
          chatbot={chatbotConfig}
          onClose={() => setIsOpen(false)}
          onReset={() => {}}
        />
      )}
      <button
        type="button"
        className="pop-chatbot-sticky__toggle"
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
        onClick={() => setIsOpen(!isOpen)}
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
