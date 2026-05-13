export const metadata = {
  title: 'There is a problem signing in',
}

export default function AuthErrorPage() {
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <h1 className="govuk-heading-l">There is a problem signing in</h1>
        <p className="govuk-body">We could not sign you in using GOV.UK One Login.</p>
        <p className="govuk-body">
          <a href="/sign-in" className="govuk-link">
            Try signing in again
          </a>
        </p>
      </div>
    </div>
  )
}
