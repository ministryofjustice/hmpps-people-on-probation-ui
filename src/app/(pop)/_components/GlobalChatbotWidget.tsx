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
  const crn = searchParams.get('crn')?.trim() || defaultCrn
  const chatbot = useMemo(() => getPopChatbotConfig(crn), [crn])
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!chatbot) {
      setIsOpen(false)
      return
    }

    setIsOpen(window.localStorage.getItem(getPopChatbotStorageKey(crn)) === 'true')
  }, [chatbot, crn])

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

  if (!chatbot || !isOpen) {
    return null
  }

  return (
    <ChatbotWidget
      crn={crn}
      chatbot={chatbot}
      onClose={() => {
        window.localStorage.setItem(getPopChatbotStorageKey(crn), 'false')
        window.dispatchEvent(new CustomEvent('pop-chatbot:close', { detail: { crn } }))
      }}
      onReset={() => {
        window.localStorage.removeItem(getPopChatbotConversationStorageKey(crn))
      }}
    />
  )
}
