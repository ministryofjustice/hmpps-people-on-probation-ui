export const dynamic = 'force-dynamic'

function normaliseReturnTo(returnTo?: string | string[]) {
  if (typeof returnTo !== 'string' || !returnTo.startsWith('/') || returnTo.startsWith('//')) return '/dashboard'
  return returnTo
}

export default async function PublicStartPage({
  searchParams,
}: {
  searchParams?: Promise<{ returnTo?: string | string[] | undefined }>
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const signInStartHref = `/sign-in/start?returnTo=${encodeURIComponent(normaliseReturnTo(resolvedSearchParams?.returnTo))}`

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <h1 className="govuk-heading-xl">Start using your probation account</h1>
        <p className="govuk-body">Sign in to your probation account to:</p>
        <ul className="govuk-list govuk-list--bullet">
          <li>see your upcoming appointments</li>
          <li>check your probation progress</li>
          <li>see the requirements of your probation</li>
        </ul>
        <p className="govuk-body">If you have any questions, contact your probation officer.</p>
        <p className="govuk-body">
          To start using your probation account, <strong>sign in or register</strong> with GOV.UK One Login.
        </p>
        <a href={signInStartHref} role="button" draggable={false} className="govuk-button" data-module="govuk-button">
          Start now
        </a>
      </div>
    </div>
  )
}
