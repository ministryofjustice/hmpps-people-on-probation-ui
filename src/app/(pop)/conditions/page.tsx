import SummaryCard from '../_components/SummaryCard'
import ServiceUnavailable from '../_components/ServiceUnavailable'
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
  if (!orderSummary) {
    return (
      <>
        <a className="govuk-back-link" href={withCrn('/', selectedCrn)}>
          Back
        </a>
        <h1 className="govuk-heading-xl">Your probation requirements</h1>
        <ServiceUnavailable />
      </>
    )
  }

  return (
    <>
      <a className="govuk-back-link" href={withCrn('/', selectedCrn)}>
        Back
      </a>

      <h1 className="govuk-heading-xl">{orderSummary.pageTitle || 'Your probation requirements'}</h1>

      <p className="govuk-body">
        {orderSummary.intro ||
          'These are the conditions of your probation. Not following these rules can lead to you being breached. This means you could end up having more rules added to your probation, going back to court or going back to prison.'}
      </p>

      <SummaryCard title={orderSummary.orderDetailsTitle || 'Order details'}>
        <dl className="govuk-summary-list">
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Order type</dt>
            <dd className="govuk-summary-list__value">{orderSummary.orderType}</dd>
          </div>
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Start date</dt>
            <dd className="govuk-summary-list__value">{orderSummary.startDate}</dd>
          </div>
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">End date</dt>
            <dd className="govuk-summary-list__value">{orderSummary.requirementsCompletionDate}</dd>
          </div>
        </dl>
      </SummaryCard>

      <SummaryCard
        title={orderSummary.rulesTitle || 'Rules of your order'}
        action={
          orderSummary.rulesAction
            ? {
                label: orderSummary.rulesAction.label,
                href: withCrn(orderSummary.rulesAction.href, selectedCrn),
              }
            : undefined
        }
      >
        <dl className="govuk-summary-list">
          {orderSummary.requirements.map(requirement => (
            <div className="govuk-summary-list__row" key={requirement.title}>
              <dt className="govuk-summary-list__key">{requirement.rows[0]?.label || requirement.title}</dt>
              <dd className="govuk-summary-list__value">{requirement.rows[0]?.value || requirement.requirement || 'Not recorded'}</dd>
            </div>
          ))}
        </dl>
      </SummaryCard>

      {orderSummary.requirements.length === 0 ? <p className="govuk-body">No active requirements found.</p> : null}
    </>
  )
}
