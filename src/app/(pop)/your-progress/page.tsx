import PageLastUpdated from '../_components/PageLastUpdated'
import SummaryCard from '../_components/SummaryCard'
import ServiceUnavailable from '../_components/ServiceUnavailable'
import { getPopProgress, resolvePopCrn, withCrn } from '@/lib/server/pop'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function ProgressMeter({
  startLabel,
  endLabel,
  valuePercent,
  color = 'blue',
}: {
  startLabel: string
  endLabel: string
  valuePercent: number
  color?: 'black' | 'blue'
}) {
  return (
    <div className="pop-progress-meter govuk-!-margin-bottom-4">
      <div className="pop-progress-meter__labels">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
      <div className="pop-progress-meter__track" aria-hidden="true">
        <span
          className={`pop-progress-meter__fill pop-progress-meter__fill--${color}`}
          style={{ width: `${Math.max(0, Math.min(valuePercent, 100))}%` }}
        />
      </div>
    </div>
  )
}

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
  if (!progressData) {
    return (
      <>
        <a className="govuk-back-link" href={withCrn('/dashboard', selectedCrn)}>
          Back
        </a>
        <h1 className="govuk-heading-xl">Your progress</h1>
        <ServiceUnavailable />
      </>
    )
  }

  return (
    <>
      <a className="govuk-back-link" href={withCrn('/dashboard', selectedCrn)}>
        Back
      </a>

      <h1 className="govuk-heading-xl">Your progress</h1>
      <PageLastUpdated value={progressData.lastUpdated} />

      <h2 className="govuk-heading-m">Overall order</h2>
      {progressData.overallOrder.meter ? <ProgressMeter {...progressData.overallOrder.meter} /> : null}
      <SummaryCard title={progressData.overallOrder.title} headingLevel={3}>
        <dl className="govuk-summary-list">
          {progressData.overallOrder.rows.map(row => (
            <div className="govuk-summary-list__row" key={row.label}>
              <dt className="govuk-summary-list__key">{row.label}</dt>
              <dd className="govuk-summary-list__value">{row.value}</dd>
            </div>
          ))}
        </dl>
      </SummaryCard>

      <h2 className="govuk-heading-m">Order requirements</h2>
      {progressData.requirements.map(requirement => (
        <div key={requirement.title}>
          {requirement.meter ? <ProgressMeter {...requirement.meter} /> : null}
          <SummaryCard
            title={requirement.title}
            headingLevel={3}
            action={
              requirement.action
                ? {
                    label: requirement.action.label,
                    href: withCrn(requirement.action.href, selectedCrn),
                  }
                : undefined
            }
          >
            <dl className="govuk-summary-list">
              {requirement.rows.map(row => (
                <div className="govuk-summary-list__row" key={row.label}>
                  <dt className="govuk-summary-list__key">{row.label}</dt>
                  <dd className="govuk-summary-list__value">{row.value}</dd>
                </div>
              ))}
            </dl>
          </SummaryCard>
        </div>
      ))}
    </>
  )
}
