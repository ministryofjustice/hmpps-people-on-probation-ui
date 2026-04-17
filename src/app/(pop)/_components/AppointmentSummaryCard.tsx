import React from 'react'
import { PopAppointment } from '@/lib/server/pop'

type AppointmentSummaryCardProps = {
  appointment: PopAppointment
  isUpcoming: boolean
  headerTitle?: string
}

export default function AppointmentSummaryCard({
  appointment,
  isUpcoming,
  headerTitle,
}: AppointmentSummaryCardProps) {
  return (
    <div className="govuk-summary-card">
      <div className="govuk-summary-card__title-wrapper">
        <h3 className="govuk-summary-card__title">{headerTitle || appointment.date}</h3>
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
          {appointment.mandatory ? (
            <li className="govuk-summary-card__action pop-appointment-mandatory-action">
              <strong className="govuk-tag pop-appointment-mandatory-tag">Mandatory</strong>
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
          {!isUpcoming ? (
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Status</dt>
              <dd className="govuk-summary-list__value">
                {appointment.status ? (
                  <span className={`govuk-tag ${appointment.statusTagClassName || 'govuk-tag--grey'}`}>
                    {appointment.status}
                  </span>
                ) : (
                  'Not recorded'
                )}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </div>
  )
}
