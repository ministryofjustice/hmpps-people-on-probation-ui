import React from 'react'
import { PopAppointment } from '@/lib/server/pop'

type AppointmentSummaryCardProps = {
  appointment: PopAppointment
  isUpcoming: boolean
}

export default function AppointmentSummaryCard({
  appointment,
  isUpcoming,
}: AppointmentSummaryCardProps) {
  return (
    <div className="govuk-summary-card">
      <div className="govuk-summary-card__title-wrapper">
        <h3 className="govuk-summary-card__title">{appointment.date}</h3>
        <ul className="govuk-summary-card__actions">
          {appointment.showOnMap && appointment.mapHref ? (
            <li className="govuk-summary-card__action">
              <a className="govuk-link" href={appointment.mapHref}>
                View on map
              </a>
            </li>
          ) : null}
          {isUpcoming && appointment.calendarHref ? (
            <li className="govuk-summary-card__action">
              <a className="govuk-link" href={appointment.calendarHref}>
                Add to calendar
              </a>
            </li>
          ) : null}
        </ul>
      </div>
      <div className="govuk-summary-card__content">
        <dl className="govuk-summary-list">
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Type</dt>
            <dd className="govuk-summary-list__value">{appointment.title || appointment.category}</dd>
          </div>
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Time</dt>
            <dd className="govuk-summary-list__value">{appointment.time}</dd>
          </div>
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Location</dt>
            <dd className="govuk-summary-list__value">{appointment.location}</dd>
          </div>
          {appointment.contact ? (
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">{appointment.contactLabel || 'Key contact'}</dt>
              <dd className="govuk-summary-list__value">{appointment.contact}</dd>
            </div>
          ) : null}
          {!isUpcoming && appointment.status ? (
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Status</dt>
              <dd className="govuk-summary-list__value">
                <span className="govuk-tag govuk-tag--green">{appointment.status}</span>
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </div>
  )
}
