import { RestClient, asSystem } from '@ministryofjustice/hmpps-rest-client'
import type { AuthenticationClient } from '@ministryofjustice/hmpps-auth-clients'
import logger from '../../logger'
import config from '../config'

export interface PersonNameResponse {
  forename: string
  middleName?: string
  surname: string
}

export interface AddressResponse {
  houseNumber?: string
  buildingName?: string
  street?: string
  town?: string
  district?: string
  county?: string
  postcode?: string
  lastUpdatedAt?: string
}

export interface TeamResponse {
  telephoneNumber?: string
  officeAddresses: AddressResponse[]
}

export interface ManagerResponse {
  name: PersonNameResponse
  team?: TeamResponse
}

export interface PersonalContactResponse {
  name: PersonNameResponse
  relationship?: string
  mobileNumber?: string
  emailAddress?: string
}

export interface PersonalDetailsResponse {
  name: PersonNameResponse
  preferredName?: string
  dateOfBirth?: string
  mainAddress?: AddressResponse
  telephoneNumber?: string
  mobileNumber?: string
  emailAddress?: string
  emergencyContacts: PersonalContactResponse[]
  practitioner?: ManagerResponse
  lastUpdatedAt?: string
}

export interface CategoryResponse {
  code: string
  description: string
}

export interface RequirementResponse {
  mainCategory?: CategoryResponse
  subCategory?: CategoryResponse
  required?: number
  completed?: number
  unit?: string
  imposedDate?: string
  expectedStartDate?: string
  expectedEndDate?: string
  actualStartDate?: string
  actualEndDate?: string
  lastUpdatedAt?: string
}

export interface LicenceConditionResponse {
  mainCategory?: CategoryResponse
  subCategory?: CategoryResponse
  startDate?: string
  expectedEndDate?: string
}

export interface OffenceResponse {
  code?: string
  description?: string
}

export interface SentenceResponse {
  type?: string
  startDate?: string
  expectedEndDate?: string
  requirements: RequirementResponse[]
  licenceConditions: LicenceConditionResponse[]
  mainOffence?: OffenceResponse
  additionalOffences?: OffenceResponse[]
  lastUpdatedAt?: string
}

export interface SentenceProgressResponse {
  sentences: SentenceResponse[]
}

export interface PractitionerResponse {
  name?: PersonNameResponse
}

export interface UnpaidWorkProjectResponse {
  code?: string
  description?: string
  address?: AddressResponse
}

export interface UnpaidWorkResponse {
  pickUpLocation?: AddressResponse
  project?: UnpaidWorkProjectResponse
}

export interface AppointmentResponse {
  date?: string
  startTime?: string
  endTime?: string
  type?: string
  typeCode?: string
  outcome?: string
  nationalStandards?: boolean
  lastUpdatedAt?: string
  practitioner?: PractitionerResponse
  location?: AddressResponse
  attended?: boolean
  complied?: boolean
  unpaidWork?: UnpaidWorkResponse | null
}

export interface PageMetadataResponse {
  size: number
  number: number
  totalElements: number
  totalPages: number
}

export interface PagedAppointmentsResponse {
  content: AppointmentResponse[]
  page: PageMetadataResponse
}

export interface RegistrationInviteValidationResponse {
  id: string
  status: string
  expiresAt: string
}

export type CompleteOneLoginRegistrationRequest = {
  token: string
  oneLoginSubject: string
  email?: string
  mobileNumber?: string
}

export type CurrentRegisteredUserRequest = {
  oneLoginSubject: string
}

export interface RegisteredUserResponse {
  id: string
  personReference: string
  email?: string
  mobileNumber?: string
  status: string
  createdAt: string
  lastSignedInAt?: string
}

export interface StepResponse {
  description?: string
  status?: string
  actor?: string
  statusDate?: string
}

export interface GoalResponse {
  goalTitle: string
  areaOfNeed: string
  relatedAreaOfNeed: string[]
  targetDate?: string
  goalStatus: string
  steps: StepResponse[]
}

export interface SentencePlanResponse {
  crn: string
  nomis: string
  planStatus?: string
  goals: GoalResponse[]
}

export type AnalyticsDeviceType = 'desktop' | 'tablet' | 'mobile' | 'unknown'

export type AnalyticsEventName =
  | 'page_viewed'
  | 'page_exited'
  | 'session_started'
  | 'session_ended'
  | 'registration_succeeded'
  | 'registration_failed'
  | 'login_succeeded'
  | 'login_failed'
  | 'interaction_clicked'

export type AnalyticsEvent = {
  eventId: string
  eventName: AnalyticsEventName
  occurredAt: string
  sessionId: string
  userId?: string
  application: string
  deviceType: AnalyticsDeviceType
  pagePath: string
  properties?: Record<string, unknown>
}

export interface PeopleOnProbationApiErrorResponse {
  status: number
  errorCode: string
  userMessage: string
  developerMessage: string
  moreInfo: string
}

export default class PeopleOnProbationApiClient extends RestClient {
  constructor(authenticationClient: AuthenticationClient) {
    super('People on Probation API', config.apis.peopleOnProbationApi, logger, authenticationClient)
  }

  getName(crn: string) {
    return this.get<PersonNameResponse>({ path: `/v1/person/${crn}/name` }, asSystem())
  }

  getPersonalDetails(crn: string) {
    return this.get<PersonalDetailsResponse>({ path: `/v1/person/${crn}/personal-details` }, asSystem())
  }

  getSentences(crn: string) {
    return this.get<SentenceProgressResponse>({ path: `/v1/person/${crn}/sentences` }, asSystem())
  }

  getFutureAppointments(crn: string, page = 0, size = 50) {
    return this.get<PagedAppointmentsResponse>(
      { path: `/v1/person/${crn}/future-appointments`, query: { page, size } },
      asSystem(),
    )
  }

  getPastAppointments(crn: string, page = 0, size = 50) {
    return this.get<PagedAppointmentsResponse>(
      { path: `/v1/person/${crn}/past-appointments`, query: { page, size } },
      asSystem(),
    )
  }

  validateRegistrationInvite(token: string) {
    return this.post<RegistrationInviteValidationResponse, PeopleOnProbationApiErrorResponse>(
      {
        path: '/v1/registration-invites/validate',
        data: { token },
      },
      asSystem(),
    )
  }

  completeOneLoginRegistration(request: CompleteOneLoginRegistrationRequest) {
    return this.post<RegisteredUserResponse, PeopleOnProbationApiErrorResponse>(
      {
        path: '/v1/registration-invites/complete-one-login',
        data: request,
      },
      asSystem(),
    )
  }

  getCurrentRegisteredUser(request: CurrentRegisteredUserRequest) {
    return this.post<RegisteredUserResponse, PeopleOnProbationApiErrorResponse>(
      {
        path: '/v1/users/current',
        data: request,
      },
      asSystem(),
    )
  }

  getSentencePlan(crn: string) {
    return this.get<SentencePlanResponse>({ path: `/v1/person/${crn}/sentence-plan` }, asSystem())
  }

  postAnalyticsEvent(event: AnalyticsEvent) {
    return this.post<{ eventId: string }, PeopleOnProbationApiErrorResponse>(
      { path: '/v1/analytics/events', data: event },
      asSystem(),
    )
  }
}
