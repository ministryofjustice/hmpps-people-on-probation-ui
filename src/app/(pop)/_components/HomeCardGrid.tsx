'use client'

import { getPopChatbotStorageKey } from '@/lib/popChatbot'

type HomeCard = {
  title: string
  description: string
  href: string
  action?: 'open-chatbot'
}

type HomeCardGridProps = {
  cards: HomeCard[]
  crn: string
}

function withCrn(path: string, crn: string) {
  return `${path}?crn=${encodeURIComponent(crn)}`
}

export default function HomeCardGrid({ cards, crn }: HomeCardGridProps) {
  const openChatbot = () => {
    window.localStorage.setItem(getPopChatbotStorageKey(crn), 'true')
    window.dispatchEvent(new CustomEvent('pop-chatbot:open', { detail: { crn } }))
  }

  return (
    <div className="govuk-card-grid">
      {cards.map((card, index) =>
        card.action === 'open-chatbot' ? (
          <button
            key={`${card.title}-${card.href}-${index}`}
            type="button"
            className="govuk-card-link govuk-card-link--button"
            onClick={openChatbot}
          >
            <h2 className="govuk-card-link__title">{card.title}</h2>
            <p className="govuk-card-link__description">{card.description}</p>
          </button>
        ) : (
          <a
            key={`${card.title}-${card.href}-${index}`}
            className="govuk-card-link"
            href={withCrn(card.href, crn)}
          >
            <h2 className="govuk-card-link__title">{card.title}</h2>
            <p className="govuk-card-link__description">{card.description}</p>
          </a>
        ),
      )}
    </div>
  )
}
