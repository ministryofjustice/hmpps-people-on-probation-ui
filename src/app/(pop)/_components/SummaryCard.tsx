import React from 'react'

type SummaryCardProps = {
  title: string
  headingLevel?: 2 | 3
  children: React.ReactNode
}

export default function SummaryCard({ title, headingLevel = 2, children }: SummaryCardProps) {
  const HeadingTag = headingLevel === 2 ? 'h2' : 'h3'

  return (
    <div className="govuk-summary-card">
      <div className="govuk-summary-card__title-wrapper">
        <HeadingTag className="govuk-summary-card__title">{title}</HeadingTag>
      </div>
      <div className="govuk-summary-card__content">{children}</div>
    </div>
  )
}
