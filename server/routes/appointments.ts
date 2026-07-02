import { Router } from 'express'

import config from '../config'
import type { Services } from '../services'
import { requireAuthentication } from '../auth/currentUser'
import {
  formatDateWithDay,
  formatTimeRange,
  formatAddress,
  formatMapUrl,
  formatPractitionerName,
  formatDateTime,
  isMissedMandatoryAppointmentOrActivity,
} from '../utils/utils'
import type { AppointmentResponse } from '../data/peopleOnProbationApiClient'

type AppointmentCardView = {
  date?: string
  timeRange?: string
  type?: string
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
  type?: string
  practitionerName?: string
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/
const timePattern = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/

function queryStringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function hasInvalidQueryValue(value: unknown): boolean {
  return value !== undefined && typeof value !== 'string'
}

const HIDDEN_PROJECT_CODES = ['N07TTA2']

export function shouldShowAppointment(appointment: AppointmentResponse): boolean {
  return !appointment.unpaidWork?.project?.code || !HIDDEN_PROJECT_CODES.includes(appointment.unpaidWork.project.code)
}

function formatAppointmentType(type?: string): string | undefined {
  return type?.replace(/\s*\(NS\)\s*$/i, '').trim()
}

function resolveAppointmentType(appointment: AppointmentResponse): string | undefined {
  if (appointment.unpaidWork) return 'Community Payback'
  return formatAppointmentType(appointment.type)
}

function formatOutcome(outcome?: string): string | undefined {
  return outcome?.replace(/\bPOP Request\b/gi, 'Your Request')
}

export function buildCalendarUrl(appointment: AppointmentResponse): string | undefined {
  if (!appointment.date) return undefined
  const params = new URLSearchParams({ date: appointment.date })
  if (!appointment.unpaidWork && appointment.startTime) {
    params.set('startTime', appointment.startTime)
    if (appointment.endTime) params.set('endTime', appointment.endTime)
  }
  const title = resolveAppointmentType(appointment)
  if (title) params.set('title', title)
  const location = formatAddress(appointment.location).join(', ')
  if (location) params.set('location', location)
  return `/appointments/calendar?${params.toString()}`
}

function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
}

function buildCalendarUid({
  date,
  startTime,
  endTime,
  title,
}: {
  date: string
  startTime?: string
  endTime?: string
  title?: string
}): string {
  const uidParts = [date, startTime ?? 'allday', endTime ?? 'no-end', title ?? 'appointment']
  const normalisedUid = uidParts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  return `${normalisedUid}@hmpps-probation`
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

  const toIcsNextDate = (d: string) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    const [year, month, day] = d.split('-').map(Number)
    const nextDate = new Date(Date.UTC(year, month - 1, day + 1))
    return `${nextDate.getUTCFullYear()}${pad(nextDate.getUTCMonth() + 1)}${pad(nextDate.getUTCDate())}`
  }

  const dtStart = startTime
    ? `DTSTART;TZID=Europe/London:${toIcsDate(date, startTime)}`
    : `DTSTART;VALUE=DATE:${toIcsDate(date)}`
  const dtEnd = startTime
    ? endTime && `DTEND;TZID=Europe/London:${toIcsDate(date, endTime)}`
    : `DTEND;VALUE=DATE:${toIcsNextDate(date)}`

  const dtstamp = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`
  const uid = buildCalendarUid({ date, startTime, endTime, title })

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Probation Account//EN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    dtStart,
    ...(dtEnd ? [dtEnd] : []),
    `SUMMARY:${escapeIcsText(title ?? 'Appointment')}`,
    ...(location ? [`LOCATION:${escapeIcsText(location)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.join('\r\n')
}

function toAppointmentCardView(appointment: AppointmentResponse): AppointmentCardView {
  const address = appointment.unpaidWork ? [] : formatAddress(appointment.location)
  const pickUpAddress = appointment.unpaidWork ? formatAddress(appointment.unpaidWork.pickUpLocation) : undefined
  const workAddress = appointment.unpaidWork ? formatAddress(appointment.unpaidWork.project?.address) : undefined
  return {
    date: formatDateWithDay(appointment.date),
    timeRange: appointment.unpaidWork ? undefined : formatTimeRange(appointment.startTime, appointment.endTime),
    type: resolveAppointmentType(appointment),
    nationalStandards: appointment.nationalStandards,
    address,
    mapUrl: formatMapUrl(address),
    calendarUrl: buildCalendarUrl(appointment),
    practitionerName: formatPractitionerName(appointment.practitioner?.name),
    attended: appointment.attended,
    outcome: formatOutcome(appointment.outcome),
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
    const { date, startTime, endTime, title, location } = req.query
    if (Object.keys(req.query).some(key => key.endsWith('[]'))) return res.sendStatus(400)
    if ([date, startTime, endTime, title, location].some(hasInvalidQueryValue)) return res.sendStatus(400)

    const calendarDate = queryStringValue(date)
    const calendarStartTime = queryStringValue(startTime)
    const calendarEndTime = queryStringValue(endTime)
    const calendarTitle = queryStringValue(title)
    const calendarLocation = queryStringValue(location)

    if (!calendarDate || !datePattern.test(calendarDate)) return res.sendStatus(400)
    if (calendarStartTime && !timePattern.test(calendarStartTime)) return res.sendStatus(400)
    if (calendarEndTime && !timePattern.test(calendarEndTime)) return res.sendStatus(400)

    const ics = generateIcs({
      date: calendarDate,
      startTime: calendarStartTime,
      endTime: calendarEndTime,
      title: calendarTitle,
      location: calendarLocation,
    })
    res.set('Content-Type', 'text/calendar; charset=utf-8')
    res.set('Content-Disposition', `attachment; filename="${buildCalendarFilename(calendarDate, calendarTitle)}"`)
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

      const futureAppointmentsToShow = futureAppointments.content.filter(shouldShowAppointment)
      const pastAppointmentsToShow = pastAppointments.content.filter(shouldShowAppointment)
      const missedAppointments = pastAppointmentsToShow.filter(isMissedMandatoryAppointmentOrActivity)
      const missedAlertEnabled = config.features.missedAppointmentAlert

      const firstMissedAppointment = missedAlertEnabled ? missedAppointments[0] : undefined
      const missedAlert: MissedAlertView | null = firstMissedAppointment
        ? {
            date: formatDateWithDay(firstMissedAppointment.date),
            timeRange: firstMissedAppointment.unpaidWork
              ? undefined
              : formatTimeRange(firstMissedAppointment.startTime, firstMissedAppointment.endTime),
            type: resolveAppointmentType(firstMissedAppointment),
            practitionerName: formatPractitionerName(firstMissedAppointment.practitioner?.name),
          }
        : null

      const mostRecentUpdate = [...futureAppointmentsToShow, ...pastAppointmentsToShow]
        .map(a => a.lastUpdatedAt)
        .filter(Boolean)
        .sort()
        .reverse()[0]

      return res.render('pages/appointments', {
        missedAlert,
        missedAppointmentsCount: missedAlertEnabled ? missedAppointments.length : 0,
        lastUpdatedAt: formatDateTime(mostRecentUpdate),
        futureAppointments: futureAppointmentsToShow.map(toAppointmentCardView),
        pastAppointments: pastAppointmentsToShow.map(toAppointmentCardView),
      })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
