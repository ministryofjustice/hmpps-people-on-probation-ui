import 'server-only'

import PeopleOnProbationApiClient, {
  type AppointmentResponse,
  type PersonalDetailsResponse,
  type RequirementResponse,
  type SentenceResponse,
} from '../data/peopleOnProbationApiClient'
import PeopleOnProbationService from '../services/peopleOnProbationService'
import { createAuthenticationClient } from '../data/authenticationClient'

export const defaultPopCrn = 'X975562'

export type PopAppointment = {
  date: string
  time: string
  title: string
  category?: string
  location: string
  contact?: string
  status?: string
  showOnMap?: boolean
}

export type PopUserDetails = {
  userId: string
  name: string
  preferredName: string
  dateOfBirth: string
  address: string
  phone: string
  mobile: string
  email: string
  emergencyContact: {
    name: string
    relationship: string
    phone: string
  }
  probationPractitioner: {
    name: string
    phone: string
    officeAddress: string
  }
}

export type PopProgressRequirement = {
  category: string
  requirement: string
  completed?: number
  required?: number
  unit?: string
}

export type PopOrderSummary = {
  orderType: string
  startDate: string
  requirementsCompletionDate: string
  requirements: PopProgressRequirement[]
}

export type PopProgressDetails = {
  orderPeriod: string
  sentenceCount: number
  requirements: PopProgressRequirement[]
}

function createService() {
  return new PeopleOnProbationService(new PeopleOnProbationApiClient(createAuthenticationClient()))
}

function formatName(name?: { forename: string; middleName?: string; surname: string } | null) {
  if (!name) return 'Not recorded'
  return [name.forename, name.middleName, name.surname].filter(Boolean).join(' ')
}

function formatDate(date?: string | null) {
  if (!date) return 'Not recorded'
  const value = new Date(date)
  if (Number.isNaN(value.getTime())) return date

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(value)
}

function formatDateWithWeekday(date?: string | null) {
  if (!date) return 'Not recorded'
  const value = new Date(date)
  if (Number.isNaN(value.getTime())) return date

  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(value)
}

function formatTime(startTime?: string | null, endTime?: string | null) {
  if (!startTime && !endTime) return 'Not recorded'
  if (!endTime) return startTime || 'Not recorded'
  return `${startTime || 'Unknown'} to ${endTime}`
}

function formatAddress(address?: {
  houseNumber?: string
  buildingName?: string
  street?: string
  town?: string
  district?: string
  county?: string
  postcode?: string
} | null) {
  if (!address) return 'Not recorded'

  return [
    address.houseNumber,
    address.buildingName,
    address.street,
    address.town,
    address.district,
    address.county,
    address.postcode,
  ]
    .filter(Boolean)
    .join('\n')
}

function formatRequirement(requirement: RequirementResponse): PopProgressRequirement {
  return {
    category: requirement.type || 'Requirement',
    requirement: requirement.description || 'No description provided',
    completed: requirement.completed,
    required: requirement.required,
    unit: requirement.unit,
  }
}

function mapAppointment(appointment: AppointmentResponse): PopAppointment {
  const status = appointment.attended === undefined ? undefined : appointment.attended ? 'Attended' : 'Missed'

  return {
    date: formatDateWithWeekday(appointment.date),
    time: formatTime(appointment.startTime, appointment.endTime),
    title: appointment.description || appointment.type || 'Appointment',
    category: appointment.type,
    location: formatAddress(appointment.location),
    contact: appointment.practitioner?.name ? formatName(appointment.practitioner.name) : undefined,
    status,
    showOnMap: Boolean(appointment.location),
  }
}

function getPrimarySentence(sentences: SentenceResponse[]) {
  return sentences[0]
}

export function resolvePopCrn(crn?: string | null) {
  if (crn?.trim()) return crn.trim()
  return defaultPopCrn
}

export function withCrn(path: string, crn: string) {
  return `${path}?crn=${encodeURIComponent(crn)}`
}

export async function getPopUserDetails(crn: string): Promise<PopUserDetails> {
  const personalDetails = await createService().getPersonalDetails(crn)
  const emergencyContact = personalDetails.emergencyContacts[0]

  return {
    userId: crn,
    name: formatName(personalDetails.name),
    preferredName: personalDetails.preferredName || 'Not recorded',
    dateOfBirth: formatDate(personalDetails.dateOfBirth),
    address: formatAddress(personalDetails.mainAddress),
    phone: personalDetails.telephoneNumber || 'Not recorded',
    mobile: personalDetails.mobileNumber || 'Not recorded',
    email: personalDetails.emailAddress || 'Not recorded',
    emergencyContact: {
      name: emergencyContact ? formatName(emergencyContact.name) : 'Not recorded',
      relationship: emergencyContact?.relationship || 'Not recorded',
      phone: emergencyContact?.mobileNumber || 'Not recorded',
    },
    probationPractitioner: {
      name: formatName(personalDetails.practitioner?.name || null),
      phone: personalDetails.practitioner?.telephoneNumber || 'Not recorded',
      officeAddress: formatAddress(personalDetails.practitioner?.team?.officeAddresses?.[0]),
    },
  }
}

export async function getPopDashboard(crn: string) {
  const details = await getPopUserDetails(crn)

  return {
    preferredName: details.preferredName !== 'Not recorded' ? details.preferredName : details.name,
  }
}

export async function getPopAppointments(crn: string) {
  const [futureAppointments, pastAppointments] = await Promise.all([
    createService().getFutureAppointments(crn, 0, 10),
    createService().getPastAppointments(crn, 0, 10),
  ])

  return {
    upcomingAppointments: futureAppointments.content.map(mapAppointment),
    pastAppointments: pastAppointments.content.map(mapAppointment),
  }
}

export async function getPopOrderSummary(crn: string): Promise<PopOrderSummary> {
  const sentences = await createService().getSentences(crn)
  const sentence = getPrimarySentence(sentences.sentences)

  return {
    orderType: sentence?.type || 'Not recorded',
    startDate: formatDate(sentence?.startDate),
    requirementsCompletionDate: formatDate(sentence?.expectedEndDate),
    requirements: (sentence?.requirements || []).map(formatRequirement),
  }
}

export async function getPopProgress(crn: string): Promise<PopProgressDetails> {
  const sentences = await createService().getSentences(crn)
  const primarySentence = getPrimarySentence(sentences.sentences)

  return {
    orderPeriod: `${formatDate(primarySentence?.startDate)} to ${formatDate(primarySentence?.expectedEndDate)}`,
    sentenceCount: sentences.sentences.length,
    requirements: (primarySentence?.requirements || []).map(formatRequirement),
  }
}

export async function getPopProbationConditions(crn: string) {
  const sentences = await createService().getSentences(crn)
  const primarySentence = getPrimarySentence(sentences.sentences)
  const requirementConditions = (primarySentence?.requirements || []).map(
    requirement => `${requirement.type || 'Requirement'}: ${requirement.description || 'No description provided'}`,
  )
  const licenceConditions = (primarySentence?.licenceConditions || []).map(
    condition => `${condition.type || 'Licence condition'}: ${condition.description || 'No description provided'}`,
  )

  return [...requirementConditions, ...licenceConditions]
}
