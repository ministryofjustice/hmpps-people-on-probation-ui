export const metadata = {
  title: 'Create a GOV.UK One Login or sign in',
}

function normaliseReturnTo(returnTo?: string | string[]) {
  if (typeof returnTo !== 'string' || !returnTo.startsWith('/') || returnTo.startsWith('//')) return '/dashboard'
  return returnTo
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: Promise<{ returnTo?: string | string[] | undefined }>
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const signInStartHref = `/sign-in/start?returnTo=${encodeURIComponent(normaliseReturnTo(resolvedSearchParams?.returnTo))}`

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <h1 className="govuk-heading-l">Create a GOV.UK One Login or sign in</h1>
        <p className="govuk-body">You'll need:</p>
        <ul className="govuk-list govuk-list--bullet">
          <li>an email address</li>
          <li>a way to get security codes - this can be a mobile phone number or an authenticator app</li>
        </ul>
        <div className="govuk-inset-text">
          You can also{' '}
          <a className="govuk-link" href="https://signin.account.gov.uk/">
            use GOV.UK One Login in Welsh (Cymraeg)
          </a>
          .
        </div>
        <p className="govuk-body">
          <a href={signInStartHref} role="button" draggable={false} className="govuk-button">
            Create your GOV.UK One Login
          </a>
        </p>
        <p className="govuk-body">
          <a href={signInStartHref} role="button" draggable={false} className="govuk-button govuk-button--secondary">
            Sign in
          </a>
        </p>
        <details className="govuk-details">
          <summary className="govuk-details__summary">
            <span className="govuk-details__summary-text">About GOV.UK One Login</span>
          </summary>
          <div className="govuk-details__text">GOV.UK One Login lets you use one sign in to access government services.</div>
        </details>
      </div>
    </div>
  )
}
