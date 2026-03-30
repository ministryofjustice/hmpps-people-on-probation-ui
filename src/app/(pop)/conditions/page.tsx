import SummaryCard from '../_components/SummaryCard'
import { getPopOrderSummary, resolvePopCrn, withCrn } from '@/lib/server/pop'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function Conditions({
  searchParams,
}: {
  searchParams?: Promise<{ crn?: string | string[] | undefined }>
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const selectedCrn = resolvePopCrn(
    typeof resolvedSearchParams?.crn === 'string' ? resolvedSearchParams.crn : undefined,
  )
  const orderSummary = await getPopOrderSummary(selectedCrn)

  return (
    <>
      <a className="govuk-back-link" href={withCrn('/', selectedCrn)}>
        Back
      </a>

      <h1 className="govuk-heading-xl">Your conditions</h1>

      <p className="govuk-body">
        You must follow these conditions to avoid returning to court, being given additional requirements, or
        being sent to prison.
      </p>

      <SummaryCard title="Order details">
        <dl className="govuk-summary-list">
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Order type</dt>
            <dd className="govuk-summary-list__value">{orderSummary.orderType}</dd>
          </div>
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Order start date</dt>
            <dd className="govuk-summary-list__value">{orderSummary.startDate}</dd>
          </div>
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Order estimated end date</dt>
            <dd className="govuk-summary-list__value">{orderSummary.requirementsCompletionDate}</dd>
          </div>
        </dl>
      </SummaryCard>

      <SummaryCard title="Order requirements">
        <dl className="govuk-summary-list">
          {orderSummary.requirements.map(requirement => (
            <div className="govuk-summary-list__row" key={requirement.category}>
              <dt className="govuk-summary-list__key">{requirement.category}</dt>
              <dd className="govuk-summary-list__value">
                <div>{requirement.requirement}</div>
                {requirement.required !== undefined ? (
                  <div className="govuk-hint govuk-!-margin-top-1">
                    {requirement.completed || 0} of {requirement.required} {requirement.unit || ''} completed
                  </div>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      </SummaryCard>

      {orderSummary.requirements.length === 0 ? <p className="govuk-body">No active requirements found.</p> : null}
    </>
  )
}
