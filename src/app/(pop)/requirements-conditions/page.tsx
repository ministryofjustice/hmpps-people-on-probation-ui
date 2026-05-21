import ConditionsList from '../_components/ConditionsList'
import ServiceUnavailable from '../_components/ServiceUnavailable'
import { getPopRequirementsAndConditions, resolvePopCrn, withCrn } from '@/lib/server/pop'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function ProbationConditions({
  searchParams,
}: {
  searchParams?: Promise<{ crn?: string | string[] | undefined }>
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const selectedCrn = resolvePopCrn(
    typeof resolvedSearchParams?.crn === 'string' ? resolvedSearchParams.crn : undefined,
  )
  const requirementsAndconditions = await getPopRequirementsAndConditions(selectedCrn)
  if (!requirementsAndconditions) {
    return (
      <>
        <div className="govuk-grid-row">
          <div className="govuk-grid-column-full">
            <a className="govuk-back-link" href={withCrn('/dashboard', selectedCrn)}>
              Back
            </a>
            <h1 className="govuk-heading-xl">Your requirements and licence conditions</h1>
            <ServiceUnavailable />
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-full">
          <a className="govuk-back-link" href={withCrn('/dashboard', selectedCrn)}>
            Back
          </a>
          <h1 className="govuk-heading-xl">Your requirements and licence conditions</h1>
        </div>
      </div>

      <div className="govuk-grid-row">
        <div className="govuk-grid-column-full govuk-!-margin-top-6">
          <p>
            We will work with you to develop your 'sentence plan' - this will set out goals and objectives to
            help you avoid further offending and make positive changes to your life. This sentence plan will
            shape what you work on, who with and when. Your plan will be reviewed with you to reflect progress
            and changes you make.
          </p>
          <h3 className="govuk-heading-m govuk-!-font-weight-bold govuk-!-margin-bottom-2">We expect you to:</h3>
          <ConditionsList items={requirementsAndconditions} />
        </div>
      </div>

      <div className="govuk-grid-row">
        <div className="govuk-grid-column-full govuk-!-margin-top-4">
          <p className="govuk-!-font-weight-bold govuk-!-margin-0 govuk-!-padding-0 govuk-!-padding-bottom-2">
            Need help understanding your conditions?
          </p>
          <p className="govuk-!-margin-0 govuk-!-padding-0 govuk-!-padding-bottom-2">
            Contact your probation practitioner for guidance on any conditions you are unsure about.
          </p>
        </div>
      </div>
    </>
  )
}
