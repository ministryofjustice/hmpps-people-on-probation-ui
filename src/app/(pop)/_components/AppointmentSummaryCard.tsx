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
      </div>
      <div className="govuk-summary-card__content">
        <dl className="govuk-summary-list">
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Time</dt>
            <dd className="govuk-summary-list__value">{appointment.time}</dd>
          </div>
          <div className="govuk-summary-list__row">
            <dt className="govuk-summary-list__key">Type</dt>
            <dd className="govuk-summary-list__value">{appointment.title || appointment.category}</dd>
          </div>
          {!isUpcoming ? (
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Location</dt>
              <dd className="govuk-summary-list__value">{appointment.location}</dd>
            </div>
          ) : null}
          {appointment.contact ? (
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Key contact</dt>
              <dd className="govuk-summary-list__value">{appointment.contact}</dd>
            </div>
          ) : null}
          {isUpcoming ? (
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">
                {appointment.category === 'Unpaid work' ? 'Meeting point' : 'Location'}
              </dt>
              <dd className="govuk-summary-list__value">{appointment.location}</dd>
            </div>
          ) : appointment.status ? (
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Status</dt>
              <dd className="govuk-summary-list__value">
                <span className="govuk-tag govuk-tag--green">{appointment.status}</span>
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="govuk-!-margin-top-3">
          {appointment.showOnMap ? (
            <button className="govuk-button govuk-button--secondary govuk-!-margin-right-2" type="button">
              View on map
            </button>
          ) : null}
          {isUpcoming ? (
            <button className="govuk-button govuk-button--secondary govuk-!-margin-right-2" type="button">
              Add to calendar
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
