import { format, parse, isValid, parseISO, startOfDay, isBefore, isAfter, addDays, intervalToDuration } from 'date-fns'
import type { AddressResponse, AppointmentResponse, PersonNameResponse } from '../data/peopleOnProbationApiClient'

const properCase = (word: string): string =>
  word.length >= 1 ? word[0].toUpperCase() + word.toLowerCase().slice(1) : word

const isBlank = (str: string): boolean => !str || /^\s*$/.test(str)

const properCaseName = (name: string): string => (isBlank(name) ? '' : name.split('-').map(properCase).join('-'))

export const convertToTitleCase = (value: string): string =>
  isBlank(value) ? '' : value.split(' ').map(properCaseName).join(' ')

export const initialiseName = (fullName?: string): string | null => {
  if (!fullName) return null
  const array = fullName.split(' ')
  return `${array[0][0]}. ${array.reverse()[0]}`
}

const pluralise = (count: number, word: string) => `${count} ${count === 1 ? word : `${word}s`}`

export const formatDateWithDay = (dateStr?: string): string | undefined => {
  if (!dateStr) return undefined
  const parsed = parseISO(dateStr)
  return isValid(parsed) ? format(parsed, 'EEEE d MMMM yyyy') : dateStr
}

export const formatDate = (dateStr?: string): string | undefined => {
  if (!dateStr) return undefined
  const parsed = parseISO(dateStr)
  return isValid(parsed) ? format(parsed, 'd MMMM yyyy') : dateStr
}

export const formatTime = (time?: string): string | undefined => {
  if (!time) return undefined
  const pattern = /^\d{2}:\d{2}:\d{2}$/.test(time) ? 'HH:mm:ss' : 'HH:mm'
  const parsed = parse(time, pattern, new Date())
  if (!isValid(parsed)) return time
  const outputPattern = parsed.getMinutes() === 0 ? 'haaa' : 'h:mmaaa'
  return format(parsed, outputPattern).toLowerCase()
}

export const formatTimeRange = (startTime?: string, endTime?: string): string | undefined => {
  const start = formatTime(startTime)
  const end = formatTime(endTime)
  if (start && end) return `${start} to ${end}`
  return start ?? end
}

const formatDateTimeWithPattern = (datetimeStr: string | undefined, datePattern: string): string | undefined => {
  if (!datetimeStr) return undefined
  const parsed = parseISO(datetimeStr)
  if (!isValid(parsed)) return datetimeStr
  const datePart = format(parsed, datePattern)
  const timePart = (parsed.getMinutes() === 0 ? format(parsed, 'haaa') : format(parsed, 'h:mmaaa')).toLowerCase()
  return `${datePart}, ${timePart}`
}

export const formatDateTime = (datetimeStr?: string): string | undefined =>
  formatDateTimeWithPattern(datetimeStr, 'd MMMM yyyy')

export const formatDateTimeWithDay = (datetimeStr?: string): string | undefined =>
  formatDateTimeWithPattern(datetimeStr, 'EEEE d MMMM yyyy')

export const parseLocalDate = (dateStr: string): Date => parse(dateStr, 'yyyy-MM-dd', new Date())

export const formatIntervalDuration = (start: Date, end: Date): string => {
  let { years = 0, months = 0, days = 0 } = intervalToDuration({ start: startOfDay(start), end: startOfDay(end) })
  if (days >= 30) {
    months += 1
    days = 0
  }
  if (months >= 12) {
    years += 1
    months = 0
  }
  const parts: string[] = []
  if (years > 0) parts.push(pluralise(years, 'year'))
  if (months > 0) parts.push(pluralise(months, 'month'))
  if (days > 0) parts.push(pluralise(days, 'day'))
  return parts.join(', ') || '0 days'
}

export const formatRemainingDuration = (endDateStr: string): string => {
  const end = parseLocalDate(endDateStr)
  const today = startOfDay(new Date())
  if (isBefore(end, today)) return '0 days'
  return formatIntervalDuration(today, addDays(end, 1))
}

export const formatUnit = (unit: string | undefined, amount: number): string => {
  const label = unit?.toLowerCase() || 'units'
  if (amount === 1 && label.endsWith('s')) return label.slice(0, -1)
  return label
}

const formatAddressLine = (line: string): string =>
  convertToTitleCase(line).replace(/\b(Of|And|The)\b/g, word => word.toLowerCase())

export const formatAddress = (address?: AddressResponse): string[] => {
  if (!address) return []
  const houseAndBuilding = [address.houseNumber, address.buildingName && formatAddressLine(address.buildingName)]
    .filter(Boolean)
    .join(' ')
  return [
    houseAndBuilding,
    address.street && formatAddressLine(address.street),
    address.town && formatAddressLine(address.town),
    address.district && formatAddressLine(address.district),
    address.county && formatAddressLine(address.county),
    address.postcode?.toUpperCase(),
  ].filter((line): line is string => Boolean(line))
}

export const formatMapUrl = (addressLines: string[]): string | null => {
  if (!addressLines.length) return null
  return `https://maps.google.com/?q=${encodeURIComponent(addressLines.join(', '))}`
}

export const sanitiseOfficeLocationUrl = (url?: string | null): string | undefined => {
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname === 'www.gov.uk' ? url : undefined
  } catch {
    return undefined
  }
}

const SENTENCE_TYPE_OVERRIDES: Record<string, string> = {
  'ora adult custody (not pss)': 'Licence',
}

export const formatSentenceType = (type?: string): string | undefined => {
  if (!type) return undefined
  const override = SENTENCE_TYPE_OVERRIDES[type.toLowerCase()]
  if (override) return override
  return type.replace(/^SA2020\s+/i, '')
}

export const formatPersonName = (name?: PersonNameResponse): string | undefined => {
  if (!name) return undefined
  return [name.forename, name.middleName, name.surname].filter(Boolean).join(' ')
}

export const formatPractitionerName = (name?: PersonNameResponse): string | undefined => {
  const formattedName = formatPersonName(name)
  return formattedName && /\bunallocated\b/i.test(formattedName) ? undefined : formattedName
}

// Broader than the appointments page's display page size — used by both the appointments page
// and the homepage as a general-purpose sample size when fetching past or future appointments
// for cross-cutting concerns (detecting missed mandatory appointments, computing the "Last
// update" timestamp), independent of which tab/page is displayed.
export const APPOINTMENTS_OVERVIEW_SIZE = 50

export const isMissedMandatoryAppointmentOrActivity = (appointment: AppointmentResponse): boolean =>
  appointment.attended === false && (appointment.nationalStandards === true || Boolean(appointment.unpaidWork))

export const shouldIncludeMissedAppointmentInAlert = (
  appointment: AppointmentResponse,
  registeredAt?: string,
  isRegistrationSession = false,
): boolean => {
  // Admin preview sessions have no citizen registration timestamp. Preserve
  // their existing all-missed view.
  if (isRegistrationSession || !registeredAt) return true
  if (!appointment.lastUpdatedAt) return false

  const registrationTime = parseISO(registeredAt)
  const appointmentUpdateTime = parseISO(appointment.lastUpdatedAt)
  return isValid(registrationTime) && isValid(appointmentUpdateTime) && isAfter(appointmentUpdateTime, registrationTime)
}
