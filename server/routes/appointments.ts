import { Router } from 'express'

import type { Services } from '../services'
import { requireAuthentication } from '../auth/currentUser'
import {
  formatDateWithDay,
  formatTimeRange,
  formatAddress,
  formatMapUrl,
  formatPersonName,
  formatDateTime,
} from '../utils/utils'
import type { AppointmentResponse } from '../data/peopleOnProbationApiClient'

type AppointmentCardView = {
  date?: string
  timeRange?: string
  type?: string
  description?: string
  nationalStandards?: boolean
  address: string[]
  mapUrl?: string | null
  calendarUrl?: string
  practitionerName?: string
  attended?: boolean
  outcome?: string
  pickUpAddress?: string[]
  pickUpMapUrl?: string | null
  workAddress?: string[]
  workMapUrl?: string | null
}

type MissedAlertView = {
  date?: string
  timeRange?: string
  description?: string
  type?: string
  practitionerName?: string
}

function buildCalendarUrl(appointment: AppointmentResponse): string | undefined {
  if (!appointment.date) return undefined
  const params = new URLSearchParams({ date: appointment.date })
  if (appointment.startTime) params.set('startTime', appointment.startTime)
  if (appointment.endTime) params.set('endTime', appointment.endTime)
  const title = appointment.type ?? appointment.description
  if (title) params.set('title', title)
  const location = formatAddress(appointment.location).join(', ')
  if (location) params.set('location', location)
  return `/appointments/calendar?${params.toString()}`
}

function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
}

export function buildCalendarFilename(date: string, title?: string): string {
  const normalisedTitle =
    title
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'appointment'

  return `${normalisedTitle}-${date}.ics`
}

export function generateIcs(params: {
  date: string
  startTime?: string
  endTime?: string
  title?: string
  location?: string
}): string {
  const { date, startTime, endTime, title, location } = params

  const toIcsDate = (d: string, t?: string) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    const [year, month, day] = d.split('-').map(Number)
    if (!t) return `${year}${pad(month)}${pad(day)}`
    const [hour, minute] = t.split(':').map(Number)
    return `${year}${pad(month)}${pad(day)}T${pad(hour)}${pad(minute)}00`
  }

  const dtStart = startTime
    ? `DTSTART;TZID=Europe/London:${toIcsDate(date, startTime)}`
    : `DTSTART;VALUE=DATE:${toIcsDate(date)}`
  let dtEnd = `DTEND;VALUE=DATE:${toIcsDate(date)}`
  if (startTime) dtEnd = `DTEND;TZID=Europe/London:${toIcsDate(date, startTime)}`
  if (endTime) dtEnd = `DTEND;TZID=Europe/London:${toIcsDate(date, endTime)}`

  const dtstamp = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`
  const uid = `${date}-${startTime ?? 'allday'}-${Date.now()}@hmpps-probation`

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Probation Account//EN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    dtStart,
    dtEnd,
    `SUMMARY:${escapeIcsText(title ?? 'Appointment')}`,
    ...(location ? [`LOCATION:${escapeIcsText(location)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.join('\r\n')
}

function toAppointmentCardView(appointment: AppointmentResponse): AppointmentCardView {
  const address = formatAddress(appointment.location)
  const pickUpAddress = appointment.unpaidWork ? formatAddress(appointment.unpaidWork.pickUpLocation) : undefined
  const workAddress = appointment.unpaidWork ? formatAddress(appointment.unpaidWork.project?.address) : undefined
  return {
    date: formatDateWithDay(appointment.date),
    timeRange: formatTimeRange(appointment.startTime, appointment.endTime),
    type: appointment.type,
    description: appointment.description,
    nationalStandards: appointment.nationalStandards,
    address,
    mapUrl: formatMapUrl(address),
    calendarUrl: buildCalendarUrl(appointment),
    practitionerName: formatPersonName(appointment.practitioner?.name),
    attended: appointment.attended,
    outcome: appointment.outcome,
    pickUpAddress,
    pickUpMapUrl: pickUpAddress ? formatMapUrl(pickUpAddress) : null,
    workAddress,
    workMapUrl: workAddress ? formatMapUrl(workAddress) : null,
  }
}

export default function appointmentsRoutes(services: Services): Router {
  const router = Router()

  router.use(requireAuthentication)

  router.get('/calendar', (req, res) => {
    const { date, startTime, endTime, title, location } = req.query as Record<string, string>
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.sendStatus(400)

    const ics = generateIcs({ date, startTime, endTime, title, location })
    res.set('Content-Type', 'text/calendar; charset=utf-8')
    res.set('Content-Disposition', `attachment; filename="${buildCalendarFilename(date, title)}"`)
    return res.send(ics)
  })

  router.get('/', async (_req, res, next) => {
    try {
      const crn = res.locals.user?.registeredUserDetails?.personReference
      if (!crn) return res.redirect('/autherror')

      const [futureAppointments, pastAppointments] = await Promise.all([
        services.peopleOnProbationService.getFutureAppointments(crn, 0, 10),
        services.peopleOnProbationService.getPastAppointments(crn, 0, 10),
      ])

      const missedPassedAppointment = pastAppointments.content.find(
        a => a.nationalStandards === true && a.attended === false,
      )

      const missedAlert: MissedAlertView | null = missedPassedAppointment
        ? {
            date: formatDateWithDay(missedPassedAppointment.date),
            timeRange: formatTimeRange(missedPassedAppointment.startTime, missedPassedAppointment.endTime),
            description: missedPassedAppointment.description,
            type: missedPassedAppointment.type,
            practitionerName: formatPersonName(missedPassedAppointment.practitioner?.name),
          }
        : null

      const allAppointments = [...futureAppointments.content, ...pastAppointments.content]
      const mostRecentUpdate = allAppointments
        .map(a => a.lastUpdatedAt)
        .filter(Boolean)
        .sort()
        .reverse()[0]

      return res.render('pages/appointments', {
        missedAlert,
        lastUpdatedAt: formatDateTime(mostRecentUpdate),
        futureAppointments: futureAppointments.content.map(toAppointmentCardView),
        pastAppointments: pastAppointments.content.map(toAppointmentCardView),
      })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
