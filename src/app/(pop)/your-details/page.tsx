import SummaryCard from '../_components/SummaryCard'
import PageLastUpdated from '../_components/PageLastUpdated'
import ServiceUnavailable from '../_components/ServiceUnavailable'
import { getPopUserDetails, resolvePopCrn, withCrn } from '@/lib/server/pop'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function YourDetails({
  searchParams,
}: {
  searchParams?: Promise<{ crn?: string | string[] | undefined }>
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const selectedCrn = resolvePopCrn(
    typeof resolvedSearchParams?.crn === 'string' ? resolvedSearchParams.crn : undefined,
  )
  const userProfile = await getPopUserDetails(selectedCrn)
  if (!userProfile) {
    return (
      <>
        <a className="govuk-back-link" href={withCrn('/', selectedCrn)}>
          Back
        </a>
        <h1 className="govuk-heading-xl govuk-!-margin-bottom-1">Your details</h1>
        <ServiceUnavailable />
      </>
    )
  }

  return (
    <>
      <a className="govuk-back-link" href={withCrn('/', selectedCrn)}>
        Back
      </a>

      <h1 className="govuk-heading-xl govuk-!-margin-bottom-1">{userProfile.pageTitle || 'Your details'}</h1>

      <PageLastUpdated value={userProfile.lastUpdated} />

      <p className="govuk-body">
        {userProfile.intro || 'To change any of this information, contact your probation practitioner.'}
      </p>

      <SummaryCard title={userProfile.personalDetailsTitle || 'Personal details'}>
        <dl className="govuk-summary-list">
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Name</dt>
            <dd className="govuk-summary-list__value">{userProfile.name}</dd>
          </div>
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Preferred name</dt>
            <dd className="govuk-summary-list__value">{userProfile.preferredName}</dd>
          </div>
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Date of birth</dt>
            <dd className="govuk-summary-list__value">{userProfile.dateOfBirth}</dd>
          </div>
        </dl>
      </SummaryCard>

      {!userProfile.hideIdentityNumbers ? (
        <SummaryCard title="Identity numbers">
          <dl className="govuk-summary-list">
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">CRN</dt>
              <dd className="govuk-summary-list__value">{userProfile.userId}</dd>
            </div>
          </dl>
        </SummaryCard>
      ) : null}

      <SummaryCard title={userProfile.contactDetailsTitle || 'Contact details'}>
        <dl className="govuk-summary-list">
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Address</dt>
            <dd className="govuk-summary-list__value">
              {userProfile.address.split('\n').map((line, index) => (
                <span key={`${line}-${index}`}>
                  {line}
                  <br />
                </span>
              ))}
            </dd>
          </div>
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Phone number</dt>
            <dd className="govuk-summary-list__value">{userProfile.phone}</dd>
          </div>
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Mobile number</dt>
            <dd className="govuk-summary-list__value">{userProfile.mobile}</dd>
          </div>
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Email address</dt>
            <dd className="govuk-summary-list__value">{userProfile.email}</dd>
          </div>
        </dl>
      </SummaryCard>

      <SummaryCard title="Emergency contact details">
        <dl className="govuk-summary-list">
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Name</dt>
            <dd className="govuk-summary-list__value">{userProfile.emergencyContact.name}</dd>
          </div>
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Relationship</dt>
            <dd className="govuk-summary-list__value">{userProfile.emergencyContact.relationship}</dd>
          </div>
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Phone number</dt>
            <dd className="govuk-summary-list__value">{userProfile.emergencyContact.phone}</dd>
          </div>
        </dl>
      </SummaryCard>

      {!userProfile.hideProbationPractitionerDetails ? (
        <SummaryCard title="Probation practitioner details">
          <dl className="govuk-summary-list">
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Name</dt>
              <dd className="govuk-summary-list__value">{userProfile.probationPractitioner.name}</dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Phone number</dt>
              <dd className="govuk-summary-list__value">{userProfile.probationPractitioner.phone}</dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Office address</dt>
              <dd className="govuk-summary-list__value">
                {userProfile.probationPractitioner.officeAddress.split('\n').map((line, index) => (
                  <span key={`${line}-${index}`}>
                    {line}
                    <br />
                  </span>
                ))}
              </dd>
            </div>
          </dl>
        </SummaryCard>
      ) : null}
    </>
  )
}
