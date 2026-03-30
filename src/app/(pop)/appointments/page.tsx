import AppointmentSummaryCard from '../_components/AppointmentSummaryCard'
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
  const { upcomingAppointments, pastAppointments } = await getPopAppointments(selectedCrn)

  return (
    <>
      <a className="govuk-back-link" href={withCrn('/', selectedCrn)}>
        Back
      </a>

      <h1 className="govuk-heading-xl">Appointments</h1>

      <p className="govuk-body">
        Attending probation appointments is part of complying with your conditions. If you have a problem
        attending an appointment, you need to tell your probation practitioner as soon as possible.
      </p>

      <h2 className="govuk-heading-l">Upcoming appointments</h2>
      {upcomingAppointments.length === 0 ? <p className="govuk-body">No upcoming appointments found.</p> : null}
      {upcomingAppointments.map(appointment => (
        <AppointmentSummaryCard
          key={`${appointment.date}-${appointment.title}`}
          appointment={appointment}
          isUpcoming
        />
      ))}

      <h2 className="govuk-heading-l">Past appointments</h2>
      {pastAppointments.length === 0 ? <p className="govuk-body">No past appointments found.</p> : null}
      {pastAppointments.map(appointment => (
        <AppointmentSummaryCard
          key={`${appointment.date}-${appointment.title}`}
          appointment={appointment}
          isUpcoming={false}
        />
      ))}
    </>
  )
}
