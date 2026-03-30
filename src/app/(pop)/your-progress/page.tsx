import SummaryCard from '../_components/SummaryCard'
import { getPopProgress, resolvePopCrn, withCrn } from '@/lib/server/pop'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function YourProgress({
  searchParams,
}: {
  searchParams?: Promise<{ crn?: string | string[] | undefined }>
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const selectedCrn = resolvePopCrn(
    typeof resolvedSearchParams?.crn === 'string' ? resolvedSearchParams.crn : undefined,
  )
  const progressData = await getPopProgress(selectedCrn)

  return (
    <>
      <a className="govuk-back-link" href={withCrn('/', selectedCrn)}>
        Back
      </a>

      <h1 className="govuk-heading-xl">Your progress</h1>

      <h2 className="govuk-heading-m">Overall order</h2>
      <SummaryCard title="Community order" headingLevel={3}>
        <dl className="govuk-summary-list">
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Order period</dt>
            <dd className="govuk-summary-list__value">{progressData.orderPeriod}</dd>
          </div>
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Sentence count</dt>
            <dd className="govuk-summary-list__value">{progressData.sentenceCount}</dd>
          </div>
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Status</dt>
            <dd className="govuk-summary-list__value">
              <span className="govuk-tag govuk-tag--green">On track</span>
            </dd>
          </div>
        </dl>
      </SummaryCard>

      <h2 className="govuk-heading-m">Order requirements</h2>
      {progressData.requirements.map(requirement => (
        <SummaryCard key={`${requirement.category}-${requirement.requirement}`} title={requirement.category} headingLevel={3}>
          <dl className="govuk-summary-list">
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Description</dt>
              <dd className="govuk-summary-list__value">{requirement.requirement}</dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Progress</dt>
              <dd className="govuk-summary-list__value">
                {requirement.required !== undefined
                  ? `${requirement.completed || 0} of ${requirement.required} ${requirement.unit || ''}`
                  : 'Not recorded'}
              </dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Status</dt>
              <dd className="govuk-summary-list__value">
                <span className="govuk-tag govuk-tag--green">On track</span>
              </dd>
            </div>
          </dl>
        </SummaryCard>
      ))}
    </>
  )
}
