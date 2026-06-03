import { useEffect, useState } from 'react'
import ChatWidget from './ChatWidget'
import { ChatbotConfig } from './config-types'

type Props = {
  apiBaseUrl: string
  domain?: string
  config?: ChatbotConfig
  userContext?: Record<string, unknown> | null
  label?: string
}

const BUTTON_SIZE = 72
const BUTTON_BOTTOM = 24
const PANEL_GAP = 16

export default function FloatingChatbot({
  apiBaseUrl,
  domain = '',
  config,
  userContext,
  label = 'Chat',
}: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [rightOffset, setRightOffset] = useState(24)
  const [bottomLift, setBottomLift] = useState(0)

  // Align the floating chrome with the right edge of the GOV.UK width container,
  // and lift it above the page footer when it scrolls into view.
  useEffect(() => {
    function update() {
      const container = document.querySelector('.govuk-width-container') as HTMLElement | null
      if (container) {
        const rect = container.getBoundingClientRect()
        setRightOffset(Math.max(24, Math.round(window.innerWidth - rect.right)))
      }
      const footer = document.querySelector('.govuk-footer, footer, [role="contentinfo"]') as HTMLElement | null
      if (footer) {
        const rect = footer.getBoundingClientRect()
        setBottomLift(Math.max(0, window.innerHeight - rect.top))
      } else {
        setBottomLift(0)
      }
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  const buttonBottom = BUTTON_BOTTOM + bottomLift
  const panelBottom = BUTTON_BOTTOM + BUTTON_SIZE + PANEL_GAP + bottomLift

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(o => !o)}
        aria-label={isOpen ? 'Close chat' : label}
        aria-expanded={isOpen}
        className="fixed z-[2147483647] flex items-center justify-center rounded-full border-0 bg-govuk-blue text-white shadow-lg transition-transform hover:scale-105 hover:bg-govuk-blue-dark"
        style={{
          width: `${BUTTON_SIZE}px`,
          height: `${BUTTON_SIZE}px`,
          right: `${rightOffset}px`,
          bottom: `${buttonBottom}px`,
        }}
      >
        {isOpen ? (
          <svg viewBox="0 0 24 24" width={34} height={34} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width={34} height={34} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      {isOpen && (
        <div
          className="fixed z-[2147483646] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl"
          style={{
            right: `${rightOffset}px`,
            bottom: `${panelBottom}px`,
            width: 'clamp(380px, 30vw, 520px)',
            height: 'min(75vh, 720px)',
            maxHeight: `calc(100vh - ${panelBottom + 24}px)`,
            maxWidth: 'calc(100vw - 48px)',
          }}
        >
          <ChatWidget
            apiBaseUrl={apiBaseUrl}
            domain={domain}
            config={config}
            userContext={userContext}
          />
        </div>
      )}
    </>
  )
}
