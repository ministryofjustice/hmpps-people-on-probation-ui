import 'server-only'

import { RestClient, asSystem } from '@ministryofjustice/hmpps-rest-client'
import type { AuthenticationClient } from '@ministryofjustice/hmpps-auth-clients'
import logger from '../../../../logger'
import { nextServerConfig } from '../config'

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
}

export interface TeamResponse {
  officeAddresses: AddressResponse[]
}

export interface ManagerResponse {
  name: PersonNameResponse
  telephoneNumber?: string
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
}

export interface RequirementResponse {
  type?: string
  description?: string
  required?: number
  completed?: number
  unit?: string
}

export interface LicenceConditionResponse {
  type?: string
  description?: string
  startDate?: string
  expectedEndDate?: string
}

export interface SentenceResponse {
  type?: string
  startDate?: string
  expectedEndDate?: string
  requirements: RequirementResponse[]
  licenceConditions: LicenceConditionResponse[]
}

export interface SentenceProgressResponse {
  sentences: SentenceResponse[]
}

export interface PractitionerResponse {
  name?: PersonNameResponse
}

export interface AppointmentResponse {
  date?: string
  startTime?: string
  endTime?: string
  type?: string
  description?: string
  practitioner?: PractitionerResponse
  location?: AddressResponse
  attended?: boolean
  complied?: boolean
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

export interface PeopleOnProbationApiErrorResponse {
  status: number
  errorCode: string
  userMessage: string
  developerMessage: string
  moreInfo: string
}

export default class PeopleOnProbationApiClient extends RestClient {
  constructor(authenticationClient: AuthenticationClient) {
    super('People on Probation API', nextServerConfig.apis.peopleOnProbationApi, logger, authenticationClient)
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

  getFutureAppointments(crn: string, page = 0, size = 10) {
    return this.get<PagedAppointmentsResponse>(
      { path: `/v1/person/${crn}/future-appointments`, query: { page, size } },
      asSystem(),
    )
  }

  getPastAppointments(crn: string, page = 0, size = 10) {
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
}
