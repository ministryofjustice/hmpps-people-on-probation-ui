import { format, isValid, parseISO, startOfDay, isAfter, differenceInCalendarMonths, differenceInDays, addMonths } from 'date-fns'
import type { AddressResponse, PersonNameResponse } from '../data/peopleOnProbationApiClient'

const properCase = (word: string): string =>
  word.length >= 1 ? word[0].toUpperCase() + word.toLowerCase().slice(1) : word

const isBlank = (str: string): boolean => !str || /^\s*$/.test(str)

const properCaseName = (name: string): string => (isBlank(name) ? '' : name.split('-').map(properCase).join('-'))

export const convertToTitleCase = (sentence: string): string =>
  isBlank(sentence) ? '' : sentence.split(' ').map(properCaseName).join(' ')

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
  const parsed = parseISO(`1970-01-01T${time}`)
  if (!isValid(parsed)) return time
  const pattern = parsed.getMinutes() === 0 ? 'haaa' : 'h:mmaaa'
  return format(parsed, pattern).toLowerCase()
}

export const formatTimeRange = (startTime?: string, endTime?: string): string | undefined => {
  const start = formatTime(startTime)
  const end = formatTime(endTime)
  if (start && end) return `${start} to ${end}`
  return start ?? end
}

export const formatDateTime = (datetimeStr?: string): string | undefined => {
  if (!datetimeStr) return undefined
  const parsed = parseISO(datetimeStr)
  if (!isValid(parsed)) return datetimeStr
  const datePart = format(parsed, 'd MMMM yyyy')
  const timePart = (parsed.getMinutes() === 0 ? format(parsed, 'haaa') : format(parsed, 'h:mmaaa')).toLowerCase()
  return `${datePart}, ${timePart}`
}

export const formatRemainingDuration = (endDateStr: string): string => {
  const end = parseISO(endDateStr)
  const today = startOfDay(new Date())

  if (!isAfter(end, today)) return '0 days'

  // differenceInCalendarMonths overshoots when end day < today day
  // e.g. today=May 27, end=Jun 21 next year → returns 13, but addMonths(today,13)=Jun 27 > Jun 21
  let months = differenceInCalendarMonths(end, today)
  if (isAfter(addMonths(today, months), end)) months--

  const days = differenceInDays(end, addMonths(today, months))

  const parts: string[] = []
  if (months > 0) parts.push(pluralise(months, 'month'))
  if (days > 0) parts.push(pluralise(days, 'day'))
  return parts.join(' ') || '0 days'
}

export const formatDuration = (days: number): string => {
  if (days <= 0) return '0 days'
  const months = Math.floor(days / 30)
  const remainingDays = days % 30
  const parts: string[] = []
  if (months > 0) parts.push(pluralise(months, 'month'))
  if (remainingDays > 0) parts.push(pluralise(remainingDays, 'day'))
  return parts.join(' ')
}

export const formatUnit = (unit: string | undefined, amount: number): string => {
  const label = unit?.toLowerCase() || 'units'
  if (amount === 1 && label.endsWith('s')) return label.slice(0, -1)
  return label
}

export const formatAddress = (address?: AddressResponse): string[] => {
  if (!address) return []
  const houseAndBuilding = [address.houseNumber, address.buildingName].filter(Boolean).join(' ')
  return [houseAndBuilding, address.street, address.town, address.district, address.county, address.postcode].filter(
    (line): line is string => Boolean(line),
  )
}

export const formatPersonName = (name?: PersonNameResponse): string | undefined => {
  if (!name) return undefined
  return [name.forename, name.middleName, name.surname].filter(Boolean).join(' ')
}
