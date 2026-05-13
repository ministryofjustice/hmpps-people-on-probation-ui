import PageLastUpdated from '../_components/PageLastUpdated'
import SummaryCard from '../_components/SummaryCard'
import ServiceUnavailable from '../_components/ServiceUnavailable'
import { getPopProbationOfficerDetails, resolvePopCrn, withCrn } from '@/lib/server/pop'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function ProbationOfficerDetails({
  searchParams,
}: {
  searchParams?: Promise<{ crn?: string | string[] | undefined }>
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const selectedCrn = resolvePopCrn(
    typeof resolvedSearchParams?.crn === 'string' ? resolvedSearchParams.crn : undefined,
  )
  const probationOfficer = await getPopProbationOfficerDetails(selectedCrn)
  if (!probationOfficer) {
    return (
      <>
        <a className="govuk-back-link" href={withCrn('/dashboard', selectedCrn)}>
          Back
        </a>
        <h1 className="govuk-heading-xl govuk-!-margin-bottom-1">Probation officer details</h1>
        <ServiceUnavailable />
      </>
    )
  }

  return (
    <>
      <a className="govuk-back-link" href={withCrn('/dashboard', selectedCrn)}>
        Back
      </a>

      <h1 className="govuk-heading-xl govuk-!-margin-bottom-1">
        {probationOfficer.pageTitle || 'Probation officer details'}
      </h1>

      <PageLastUpdated value={probationOfficer.lastUpdated} />

      <p className="govuk-body">
        {probationOfficer.intro ||
          'If you need to update any of your details, you should contact your probation officer and let them know.'}
      </p>

      <SummaryCard title={probationOfficer.sectionTitle || 'Probation officer details'}>
        <dl className="govuk-summary-list">
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Name</dt>
            <dd className="govuk-summary-list__value">{probationOfficer.name}</dd>
          </div>
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Phone number</dt>
            <dd className="govuk-summary-list__value">{probationOfficer.phone}</dd>
          </div>
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Office address</dt>
            <dd className="govuk-summary-list__value">
              {probationOfficer.officeAddress.split('\n').map((line, index) => (
                <span key={`${line}-${index}`}>
                  {line}
                  <br />
                </span>
              ))}
            </dd>
          </div>
        </dl>
      </SummaryCard>
    </>
  )
}
