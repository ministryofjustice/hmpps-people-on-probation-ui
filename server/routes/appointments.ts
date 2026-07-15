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

export type AppointmentCardView = {
  date?: string
  timeRange?: string
  type?: string
  isUnpaidWork: boolean
  nationalStandards?: boolean
  address: string[]
  mapUrl?: string | null
  calendarUrl?: string
  practitionerName?: string
  attended?: boolean
  outcome?: string
  outcomeTagClasses?: string
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

// Main category codes (RequirementResponse/LicenceConditionResponse.mainCategory.code) that
// determine which "why this might happen" guidance applies on the appointments page.
// Codes not in either list (e.g. F = RAR, W = unpaid work) get the plain inset text with no
// reveal, and no extra guidance bullet is needed for them.
const TAG_APPOINTMENT_CATEGORY_CODES = ['RM49', 'RM59', 'T']
const OTHER_CHANNEL_APPOINTMENT_CATEGORY_CODES = ['Q', 'G', 'H', 'P', 'E', 'I', 'RM38', 'RM37']

export function shouldShowAppointment(appointment: AppointmentResponse): boolean {
  return !appointment.unpaidWork?.project?.code || !HIDDEN_PROJECT_CODES.includes(appointment.unpaidWork.project.code)
}

function formatAppointmentType(type?: string): string | undefined {
  return type?.replace(/\s*\(NS\)\s*$/i, '').trim()
}

const APPOINTMENT_TYPE_CODE_LABELS: Record<string, string> = {
  C084: 'In-person appointment', // 3 Way Meeting (NS)
  CAPY: 'Course activity', // AcP - Attendance (NS)
  CAPW: 'Meeting before course', // AcP - Attendance - Pre-Group 1:1 (NS)
  C243: 'Alcohol rehab appointment – group', // Alcohol Group Work Session (NS)
  C089: 'Alcohol rehab appointment', // Alcohol Key Worker Session (NS)
  C314: 'Appointment with support service', // Appointment with External Agency (NS)
  GTS2: 'Appointment with support service', // Appointment with Provider
  C357: 'Appointment with psychologist', // Appointment with Psychologist
  C242: 'Drug rehab appointment – group', // Drug Group Work Session (NS)
  C090: 'Drug rehab appointment', // Drug Key Worker Session (NS)
  DRGAPT: 'Drug test appointment', // Drug Test Appointment (NS)
  GTS: 'Final appointment with support service', // Final Appointment with Provider
  CHVS: 'Home visit', // Home Visit to Case (NS)
  COAI: 'First in-person appointment', // Initial Appointment - In office (NS)
  GTS1: 'First appointment with support service', // Initial Appointment with Provider
  COSR: 'Appointment', // Interview for Report / Other
  MHT2: 'Mental health appointment', // Mental Health 3 way appointment
  MHT1: 'Mental health appointment', // Mental Health Session
  COOO: 'In-person appointment', // Planned Contact – other than office (NS)
  CODC: 'Doorstep appointment', // Planned Doorstep Contact (NS)
  COAP: 'In-person appointment', // Planned Office Visit (NS)
  COPT: 'Phone appointment', // Planned Telephone Contact (NS)
  COVC: 'Video appointment', // Planned Video Contact (NS)
  CUPA: 'Community payback (unpaid work)', // CP/UPW - Appointment/Attendance (NS)
  CAPX: 'Course activity', // IAPS Attendance (NS)
  CAPZ: 'Review meeting after course', // AcP - Attendance - Post Programme Review (NS)
  DRGDAA: 'Drug test assessment', // Appointment for Drug Testing Assessment (NS)
  CRSAPT: 'Appointment with support service', // Appointment with CRS Provider (NS)
  CRSSAA: 'Appointment with support service', // Appointment with CRS Staff (NS)
}

export function resolveAppointmentType(appointment: AppointmentResponse): string | undefined {
  if (appointment.unpaidWork) return 'Community payback (unpaid work)'
  const codeLabel = appointment.typeCode ? APPOINTMENT_TYPE_CODE_LABELS[appointment.typeCode.toUpperCase()] : undefined
  return codeLabel ?? formatAppointmentType(appointment.type)
}

type OutcomeTag = { text: string; classes: string }

const ABSENCE_ACCEPTED_TAG: OutcomeTag = { text: 'Absence accepted', classes: 'govuk-tag--grey' }

// Keyed on the outcome text normalised via normalizeOutcomeText below (lowercase,
// punctuation/whitespace collapsed to single spaces) — the backend's outcome
// text is otherwise free text, so this tolerates minor spacing/casing/dash
// differences (e.g. "PoP Request" vs "POP Request") while still requiring the
// wording to match.
const OUTCOME_TAGS: Record<string, OutcomeTag> = {
  'attended complied': { text: 'Attended', classes: 'govuk-tag--green' },
  'attended failed to comply': { text: 'Attended but failed to comply', classes: 'govuk-tag--red' },
  'attended sent home behaviour': { text: 'Attended but failed to comply', classes: 'govuk-tag--red' },
  'attended sent home service issues': { text: 'Attended but sent home early', classes: 'govuk-tag--green' },
  'failed to attend': { text: 'Missed', classes: 'govuk-tag--red' },
  'failed to comply with other instruction': { text: 'Did not comply with instructions', classes: 'govuk-tag--red' },
  'rescheduled pop request': { text: 'Rescheduled at your request', classes: 'govuk-tag--grey' },
  'rescheduled service request': { text: 'Rescheduled by Probation Service', classes: 'govuk-tag--grey' },
  suspended: { text: 'Sentence suspended', classes: 'govuk-tag--green' },
  'unacceptable absence': { text: 'Missed – absence reason rejected', classes: 'govuk-tag--red' },
  'yot breach not enforceable': { text: 'Breach – not enforceable', classes: 'govuk-tag--grey' },
}

function normalizeOutcomeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function resolveOutcomeTag(outcome?: string): OutcomeTag | undefined {
  if (!outcome) return undefined
  const normalized = normalizeOutcomeText(outcome)

  // "Acceptable Absence - <reason>" and "Acceptable Failure - <reason>" cover
  // many sub-reasons (court/legal, employment, medical, holiday, etc.) that
  // all resolve to the same label/colour — matched by prefix rather than
  // enumerating every reason so new sub-reasons still resolve correctly.
  if (normalized.startsWith('acceptable absence') || normalized.startsWith('acceptable failure')) {
    return ABSENCE_ACCEPTED_TAG
  }

  return OUTCOME_TAGS[normalized] ?? { text: outcome, classes: 'govuk-tag--grey' }
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
  const location = appointment.unpaidWork ? '' : formatAddress(appointment.location).join(', ')
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

export function toAppointmentCardView(appointment: AppointmentResponse): AppointmentCardView {
  const address = appointment.unpaidWork ? [] : formatAddress(appointment.location)
  const pickUpAddress = appointment.unpaidWork ? formatAddress(appointment.unpaidWork.pickUpLocation) : undefined
  const workAddress = appointment.unpaidWork ? formatAddress(appointment.unpaidWork.project?.address) : undefined
  const outcomeTag = resolveOutcomeTag(appointment.outcome)
  return {
    date: formatDateWithDay(appointment.date),
    timeRange: appointment.unpaidWork ? undefined : formatTimeRange(appointment.startTime, appointment.endTime),
    type: resolveAppointmentType(appointment),
    isUnpaidWork: Boolean(appointment.unpaidWork),
    nationalStandards: appointment.nationalStandards,
    address,
    mapUrl: formatMapUrl(address),
    calendarUrl: buildCalendarUrl(appointment),
    practitionerName: appointment.unpaidWork ? undefined : formatPractitionerName(appointment.practitioner?.name),
    attended: appointment.attended,
    outcome: outcomeTag?.text,
    outcomeTagClasses: outcomeTag?.classes,
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

      const [futureAppointments, pastAppointments, sentenceProgress] = await Promise.all([
        services.peopleOnProbationService.getFutureAppointments(crn, 0, 50),
        services.peopleOnProbationService.getPastAppointments(crn, 0, 50),
        services.peopleOnProbationService.getSentences(crn),
      ])

      const mainCategoryCodes = sentenceProgress.sentences.flatMap(sentence => [
        ...sentence.requirements.map(r => r.mainCategory?.code),
        ...sentence.licenceConditions.map(lc => lc.mainCategory?.code),
      ])
      const hasTagAppointments = mainCategoryCodes.some(code => TAG_APPOINTMENT_CATEGORY_CODES.includes(code))
      const hasOtherChannelAppointments = mainCategoryCodes.some(code =>
        OTHER_CHANNEL_APPOINTMENT_CATEGORY_CODES.includes(code),
      )

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
        hasTagAppointments,
        hasOtherChannelAppointments,
        futureAppointments: futureAppointmentsToShow.map(toAppointmentCardView),
        pastAppointments: pastAppointmentsToShow.map(toAppointmentCardView),
      })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
