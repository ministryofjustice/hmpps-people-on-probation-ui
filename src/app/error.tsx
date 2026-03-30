'use client'

export default function ErrorPage({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string }
  reset: () => void
}>) {
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <h1 className="govuk-heading-xl">Something went wrong</h1>
        <p className="govuk-body">{error.message}</p>
        <button className="govuk-button" type="button" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </div>
  )
}
