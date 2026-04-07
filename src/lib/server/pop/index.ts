import 'server-only'

import logger from '../../../../logger'
import PeopleOnProbationApiClient, {
  type AppointmentResponse,
  type RequirementResponse,
  type SentenceResponse,
} from '../data/peopleOnProbationApiClient'
import PeopleOnProbationService from '../services/peopleOnProbationService'
import { createAuthenticationClient } from '../data/authenticationClient'
import { getStaticProfile, hasStaticProfile } from './staticData'

export const defaultPopCrn = 'X975562'
const popDataMode = process.env.POP_DATA_MODE ?? 'hybrid'

export type PopAppointment = {
  date: string
  time: string
  title: string
  category?: string
  location: string
  contact?: string
  contactLabel?: string
  status?: string
  showOnMap?: boolean
  mapHref?: string
  calendarHref?: string
}

export type PopAppointmentsDetails = {
  pageTitle?: string
  lastUpdated?: string
  intro?: string
  warning?: string
  upcomingTitle?: string
  pastTitle?: string
  upcomingAppointments: PopAppointment[]
  pastAppointments: PopAppointment[]
}

export type PopUserDetails = {
  userId: string
  pageTitle?: string
  lastUpdated?: string
  intro?: string
  personalDetailsTitle?: string
  contactDetailsTitle?: string
  hideIdentityNumbers?: boolean
  hideProbationPractitionerDetails?: boolean
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
    email?: string
  }
}

export type PopProbationOfficerDetails = {
  pageTitle?: string
  lastUpdated?: string
  intro?: string
  sectionTitle?: string
  name: string
  phone: string
  officeAddress: string
  email: string
  emailHref?: string
}

export type PopProgressRequirement = {
  category?: string
  requirement?: string
  completed?: number
  required?: number
  unit?: string
  title: string
  rows: {
    label: string
    value: string
  }[]
  action?: {
    label: string
    href: string
  }
}

export type PopOrderSummary = {
  pageTitle?: string
  intro?: string
  orderDetailsTitle?: string
  rulesTitle?: string
  rulesAction?: {
    label: string
    href: string
  }
  orderType: string
  startDate: string
  requirementsCompletionDate: string
  requirements: PopProgressRequirement[]
}

export type PopProgressDetails = {
  lastUpdated?: string
  overallOrder: {
    title: string
    rows: {
      label: string
      value: string
    }[]
  }
  requirements: PopProgressRequirement[]
}

export type PopDashboard = {
  welcomeName: string
  cards?: {
    title: string
    description: string
    href: string
  }[]
}

function createService() {
  return new PeopleOnProbationService(new PeopleOnProbationApiClient(createAuthenticationClient()))
}

async function returnNullWhenUnavailable<T>(operation: string, fetchData: () => Promise<T>): Promise<T | null> {
  try {
    return await fetchData()
  } catch (error) {
    logger.warn({ error, operation }, 'People on Probation data unavailable')
    return null
  }
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

function formatAddress(
  address?: {
    houseNumber?: string
    buildingName?: string
    street?: string
    town?: string
    district?: string
    county?: string
    postcode?: string
  } | null,
) {
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

function toSentenceCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatRequirementValue(value?: number, unit?: string) {
  if (value === undefined || value === null) return 'Not recorded'
  return `${value} ${unit || ''}`.trim()
}

function buildRequirementRows(requirement: RequirementResponse) {
  const unit = requirement.unit || ''
  const category = requirement.type || 'Requirement'

  if (category.toLowerCase() === 'unpaid work') {
    const required = requirement.required ?? 0
    const completed = requirement.completed ?? 0
    const remaining = Math.max(required - completed, 0)

    return [
      { label: 'Total hours', value: formatRequirementValue(required, 'Hours') },
      { label: 'Hours completed', value: formatRequirementValue(completed, 'Hours') },
      { label: 'Hours left to do', value: formatRequirementValue(remaining, 'Hours') },
    ]
  }

  const unitLabel = unit ? toSentenceCase(unit) : 'Amount'
  const rows = []

  if (requirement.required !== undefined && requirement.required !== null) {
    rows.push({
      label: `Total ${unit.toLowerCase() || 'required'}`,
      value: formatRequirementValue(requirement.required, unitLabel),
    })
  }

  if (requirement.completed !== undefined && requirement.completed !== null) {
    rows.push({
      label: `${unitLabel} completed`,
      value: formatRequirementValue(requirement.completed, unitLabel),
    })
  }

  if (requirement.required !== undefined && requirement.completed !== undefined) {
    rows.push({
      label: `${unitLabel} left to do`,
      value: formatRequirementValue(Math.max((requirement.required || 0) - (requirement.completed || 0), 0), unitLabel),
    })
  }

  if (rows.length > 0) return rows

  return [{ label: 'Description', value: requirement.description || 'No description provided' }]
}

function formatRequirement(requirement: RequirementResponse): PopProgressRequirement {
  return {
    category: requirement.type || 'Requirement',
    requirement: requirement.description || 'No description provided',
    completed: requirement.completed,
    required: requirement.required,
    unit: requirement.unit,
    title: requirement.type || 'Requirement',
    rows: buildRequirementRows(requirement),
    action: {
      label: 'View probation conditions',
      href: '/conditions',
    },
  }
}

function getTimeLeft(endDate?: string | null) {
  if (!endDate) return 'Not recorded'

  const targetDate = new Date(endDate)
  if (Number.isNaN(targetDate.getTime())) return 'Not recorded'

  const now = new Date()
  const totalMonths = (targetDate.getFullYear() - now.getFullYear()) * 12 + (targetDate.getMonth() - now.getMonth())

  if (totalMonths <= 0) return 'Less than 1 month'
  if (totalMonths === 1) return '1 month'
  return `${totalMonths} months`
}

function mapAppointment(appointment: AppointmentResponse): PopAppointment {
  let status: string | undefined
  if (appointment.attended !== undefined) {
    status = appointment.attended ? 'Attended' : 'Missed'
  }

  return {
    date: formatDateWithWeekday(appointment.date),
    time: formatTime(appointment.startTime, appointment.endTime),
    title: appointment.description || appointment.type || 'Appointment',
    category: appointment.type,
    location: formatAddress(appointment.location),
    contact: appointment.practitioner?.name ? formatName(appointment.practitioner.name) : undefined,
    contactLabel: 'Key contact',
    status,
    showOnMap: Boolean(appointment.location),
    mapHref: appointment.location ? '#' : undefined,
    calendarHref: '#',
  }
}

function getPrimarySentence(sentences: SentenceResponse[]) {
  return sentences[0]
}

function shouldUseStaticData(crn: string) {
  if (popDataMode === 'static') return true
  if (popDataMode === 'dynamic') return false
  return hasStaticProfile(crn)
}

function getStaticData<T>(
  crn: string,
  selector: (profile: NonNullable<ReturnType<typeof getStaticProfile>>) => T,
): T | null {
  if (!shouldUseStaticData(crn)) return null

  const profile = getStaticProfile(crn)
  return profile ? selector(profile) : null
}

export function resolvePopCrn(crn?: string | null) {
  if (crn?.trim()) return crn.trim()
  return defaultPopCrn
}

export function withCrn(path: string, crn: string) {
  return `${path}?crn=${encodeURIComponent(crn)}`
}

export async function getPopUserDetails(crn: string): Promise<PopUserDetails | null> {
  const staticData = getStaticData(crn, profile => profile.userDetails)
  if (staticData) return staticData

  return returnNullWhenUnavailable('getPopUserDetails', async () => {
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
  })
}

export async function getPopDashboard(crn: string): Promise<PopDashboard | null> {
  const staticData = getStaticData(crn, profile => profile.dashboard)
  if (staticData) return staticData

  const details = await getPopUserDetails(crn)
  if (!details) return null

  return {
    welcomeName: details.preferredName !== 'Not recorded' ? details.preferredName : details.name,
  }
}

export async function getPopProbationOfficerDetails(crn: string): Promise<PopProbationOfficerDetails | null> {
  const staticData = getStaticData(crn, profile => profile.probationOfficerDetails)
  if (staticData) return staticData

  const details = await getPopUserDetails(crn)
  if (!details) return null

  return {
    pageTitle: 'Probation officer details',
    intro: 'If you need to update any of your details, you should contact your probation officer and let them know.',
    sectionTitle: 'Probation officer details',
    name: details.probationPractitioner.name,
    phone: details.probationPractitioner.phone,
    officeAddress: details.probationPractitioner.officeAddress,
    email: details.probationPractitioner.email || 'Not recorded',
  }
}

export async function getPopAppointments(crn: string): Promise<PopAppointmentsDetails | null> {
  const staticData = getStaticData(crn, profile => profile.appointments)
  if (staticData) return staticData

  return returnNullWhenUnavailable('getPopAppointments', async () => {
    const [futureAppointments, pastAppointments] = await Promise.all([
      createService().getFutureAppointments(crn, 0, 10),
      createService().getPastAppointments(crn, 0, 10),
    ])

    return {
      pageTitle: 'Past and future appointments',
      intro:
        'Your probation appointments are part of the rules of your probation. If you have any problems attending an appointment, you should let your probation officer know as soon as possible.',
      warning:
        'This is not a full list of all your probation appointments. There could be other appointments not listed here.',
      upcomingTitle: 'Upcoming appointments',
      pastTitle: 'Past appointments',
      upcomingAppointments: futureAppointments.content.map(mapAppointment),
      pastAppointments: pastAppointments.content.map(mapAppointment),
    }
  })
}

export async function getPopOrderSummary(crn: string): Promise<PopOrderSummary | null> {
  const staticData = getStaticData(crn, profile => profile.orderSummary)
  if (staticData) return staticData

  return returnNullWhenUnavailable('getPopOrderSummary', async () => {
    const sentences = await createService().getSentences(crn)
    const sentence = getPrimarySentence(sentences.sentences)

    return {
      pageTitle: 'Your probation conditions',
      intro:
        'These are the conditions of your probation. Not following these rules can lead to you being breached. This means you could end up having more rules added to your probation, going back to court or going back to prison.',
      orderDetailsTitle: 'Order details',
      rulesTitle: 'Rules of your order',
      rulesAction: {
        label: 'View progress',
        href: '/your-progress',
      },
      orderType: sentence?.type || 'Not recorded',
      startDate: formatDate(sentence?.startDate),
      requirementsCompletionDate: formatDate(sentence?.expectedEndDate),
      requirements: (sentence?.requirements || []).map(formatRequirement),
    }
  })
}

export async function getPopProgress(crn: string): Promise<PopProgressDetails | null> {
  const staticData = getStaticData(crn, profile => profile.progress)
  if (staticData) return staticData

  return returnNullWhenUnavailable('getPopProgress', async () => {
    const sentences = await createService().getSentences(crn)
    const primarySentence = getPrimarySentence(sentences.sentences)

    return {
      overallOrder: {
        title: primarySentence?.type || 'Community order',
        rows: [
          { label: 'Order start date', value: formatDate(primarySentence?.startDate) },
          { label: 'Order end date', value: formatDate(primarySentence?.expectedEndDate) },
          { label: 'Time left', value: getTimeLeft(primarySentence?.expectedEndDate) },
        ],
      },
      requirements: (primarySentence?.requirements || []).map(formatRequirement),
    }
  })
}

export async function getPopRequirementsAndConditions(crn: string): Promise<string[] | null> {
  return returnNullWhenUnavailable('getPopRequirementsAndConditions', async () => {
    const sentences = await createService().getSentences(crn)
    const primarySentence = getPrimarySentence(sentences.sentences)
    const requirementConditions = (primarySentence?.requirements || []).map(
      requirement => `${requirement.type || 'Requirement'}: ${requirement.description || 'No description provided'}`,
    )
    const licenceConditions = (primarySentence?.licenceConditions || []).map(
      condition => `${condition.type || 'Licence condition'}: ${condition.description || 'No description provided'}`,
    )

    return [...requirementConditions, ...licenceConditions]
  })
}
