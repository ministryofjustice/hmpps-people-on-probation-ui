import AppointmentSummaryCard from '../_components/AppointmentSummaryCard'
import PageLastUpdated from '../_components/PageLastUpdated'
import ServiceUnavailable from '../_components/ServiceUnavailable'
import { getPopAppointments, resolvePopCrn, withCrn } from '@/lib/server/pop'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function Appointments({
  searchParams,
}: {
  searchParams?: Promise<{ crn?: string | string[] | undefined }>
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const selectedCrn = resolvePopCrn(
    typeof resolvedSearchParams?.crn === 'string' ? resolvedSearchParams.crn : undefined,
  )
  const appointments = await getPopAppointments(selectedCrn)
  if (!appointments) {
    return (
      <>
        <a className="govuk-back-link" href={withCrn('/', selectedCrn)}>
          Back
        </a>
        <h1 className="govuk-heading-xl">Past and future appointments</h1>
        <ServiceUnavailable />
      </>
    )
  }

  return (
    <>
      <a className="govuk-back-link" href={withCrn('/', selectedCrn)}>
        Back
      </a>

      <h1 className="govuk-heading-xl">{appointments.pageTitle || 'Past and future appointments'}</h1>
      <PageLastUpdated value={appointments.lastUpdated} />

      <p className="govuk-body">
        {appointments.intro ||
          'Your probation appointments are part of the rules of your probation. If you have any problems attending an appointment, you should let your probation officer know as soon as possible.'}
      </p>
      <p className="govuk-body govuk-!-font-weight-bold">{appointments.warning}</p>

      <h2 className="govuk-heading-l">{appointments.upcomingTitle || 'Upcoming appointments'}</h2>
      {appointments.upcomingAppointments.length === 0 ? (
        <p className="govuk-body">No upcoming appointments found.</p>
      ) : null}
      {appointments.upcomingAppointments.map(appointment => (
        <AppointmentSummaryCard
          key={`${appointment.date}-${appointment.title}`}
          appointment={appointment}
          isUpcoming
        />
      ))}

      <h2 className="govuk-heading-l">{appointments.pastTitle || 'Past appointments'}</h2>
      {appointments.pastAppointments.length === 0 ? (
        <p className="govuk-body">No past appointments found.</p>
      ) : null}
      {appointments.pastAppointments.map(appointment => (
        <AppointmentSummaryCard
          key={`${appointment.date}-${appointment.title}`}
          appointment={appointment}
          isUpcoming={false}
        />
      ))}
    </>
  )
}
