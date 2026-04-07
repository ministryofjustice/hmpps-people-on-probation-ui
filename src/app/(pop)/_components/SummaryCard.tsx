import React from 'react'

type SummaryCardProps = {
  title: string
  headingLevel?: 2 | 3
  action?: {
    label: string
    href: string
  }
  children: React.ReactNode
}

export default function SummaryCard({ title, headingLevel = 2, action, children }: SummaryCardProps) {
  const HeadingTag = headingLevel === 2 ? 'h2' : 'h3'

  return (
    <div className="govuk-summary-card">
      <div className="govuk-summary-card__title-wrapper">
        <HeadingTag className="govuk-summary-card__title">{title}</HeadingTag>
        {action ? (
          <ul className="govuk-summary-card__actions">
            <li className="govuk-summary-card__action">
              <a className="govuk-link" href={action.href}>
                {action.label}
              </a>
            </li>
          </ul>
        ) : null}
      </div>
      <div className="govuk-summary-card__content">{children}</div>
    </div>
  )
}
