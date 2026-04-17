'use client'

export default function Error({ error }: { error: Error }) {
  return (
    <main className="govuk-main-wrapper">
      <h1 className="govuk-heading-l">Something went wrong</h1>
      <p className="govuk-body">{error.message}</p>
    </main>
  )
}
