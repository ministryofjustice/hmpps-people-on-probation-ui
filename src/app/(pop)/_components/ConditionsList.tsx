import React from 'react'

type ConditionsListProps = {
  items: string[]
}

export default function ConditionsList({ items }: ConditionsListProps) {
  return (
    <ul className="govuk-list govuk-list--bullet govuk-list--spaced">
      {items.map(item => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}
