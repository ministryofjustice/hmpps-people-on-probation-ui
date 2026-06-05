import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ChatWidget from './ChatWidget'
import { ChatbotConfig } from './config-types'

type Props = {
  apiBaseUrl: string
  domain?: string
  config?: ChatbotConfig
  label?: string
}

const BUTTON_SIZE = 72
const BUTTON_BOTTOM = 24
const PANEL_GAP = 16

// Apply a CSS property via the JS DOM API rather than React's style prop,
// because the page CSP blocks inline style="…" attributes.
function applyStyle(el: HTMLElement | null, property: string, value: string): void {
  if (el) el.style.setProperty(property, value)
}

export default function FloatingChatbot({ apiBaseUrl, domain = '', config, label = 'Chat' }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [rightOffset, setRightOffset] = useState(24)
  const [bottomLift, setBottomLift] = useState(0)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

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

  // Apply dynamic positioning via DOM API (not React's style prop) so the CSP
  // policy on inline style attributes doesn't strip our placement.
  useLayoutEffect(() => {
    applyStyle(buttonRef.current, 'right', `${rightOffset}px`)
    applyStyle(buttonRef.current, 'bottom', `${buttonBottom}px`)
  }, [rightOffset, buttonBottom])

  useLayoutEffect(() => {
    applyStyle(panelRef.current, 'right', `${rightOffset}px`)
    applyStyle(panelRef.current, 'bottom', `${panelBottom}px`)
    applyStyle(panelRef.current, 'max-height', `calc(100vh - ${panelBottom + 24}px)`)
  }, [rightOffset, panelBottom, isOpen])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(o => !o)}
        aria-label={isOpen ? 'Close chat' : label}
        aria-expanded={isOpen}
        className="chatbot-button fixed z-[2147483647] flex h-[72px] w-[72px] items-center justify-center rounded-full border-0 bg-govuk-blue text-white shadow-lg transition-transform hover:scale-105 hover:bg-govuk-blue-dark"
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
          ref={panelRef}
          className="chatbot-panel fixed z-[2147483646] h-[min(75vh,720px)] w-[clamp(380px,30vw,520px)] max-w-[calc(100vw-48px)] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl"
        >
          <ChatWidget apiBaseUrl={apiBaseUrl} domain={domain} config={config} />
        </div>
      )}
    </>
  )
}
