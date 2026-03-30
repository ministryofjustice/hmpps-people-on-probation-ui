import { redirect } from 'next/navigation'
import ServiceUnavailable from './_components/ServiceUnavailable'
import { defaultPopCrn, getPopDashboard, resolvePopCrn, withCrn } from '@/lib/server/pop'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function PopHome({
  searchParams,
}: {
  searchParams?: Promise<{ crn?: string | string[] | undefined }>
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const requestedCrn = typeof resolvedSearchParams?.crn === 'string' ? resolvedSearchParams.crn : undefined

  if (!requestedCrn?.trim()) {
    redirect(`/?crn=${encodeURIComponent(defaultPopCrn)}`)
  }

  const selectedCrn = resolvePopCrn(requestedCrn)
  const dashboard = await getPopDashboard(selectedCrn)
  if (!dashboard) {
    return <ServiceUnavailable />
  }

  return (
    <>
      <h1 className="govuk-heading-xl">Welcome, {dashboard.preferredName}</h1>
      <div className="govuk-card-grid">
        <a className="govuk-card-link" href={withCrn('/your-details', selectedCrn)}>
          <h2 className="govuk-card-link__title">Your details</h2>
          <p className="govuk-card-link__description">View your personal information</p>
        </a>
        <a className="govuk-card-link" href={withCrn('/your-progress', selectedCrn)}>
          <h2 className="govuk-card-link__title">Your progress</h2>
          <p className="govuk-card-link__description">Track your community order progress</p>
        </a>
        <a className="govuk-card-link" href={withCrn('/appointments', selectedCrn)}>
          <h2 className="govuk-card-link__title">Past and upcoming appointments</h2>
          <p className="govuk-card-link__description">View your scheduled sessions</p>
        </a>
        <a className="govuk-card-link" href={withCrn('/conditions', selectedCrn)}>
          <h2 className="govuk-card-link__title">Your conditions</h2>
          <p className="govuk-card-link__description">View the conditions of your order</p>
        </a>
      </div>
    </>
  )
}
