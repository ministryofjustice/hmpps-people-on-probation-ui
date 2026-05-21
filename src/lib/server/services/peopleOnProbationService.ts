import 'server-only'

import PeopleOnProbationApiClient, {
  type CompleteOneLoginRegistrationRequest,
  type CurrentRegisteredUserRequest,
} from '../data/peopleOnProbationApiClient'
import { createAuthenticationClient } from '../data/authenticationClient'

export default class PeopleOnProbationService {
  constructor(private readonly peopleOnProbationApiClient: PeopleOnProbationApiClient) {}

  getName(crn: string) {
    return this.peopleOnProbationApiClient.getName(crn)
  }

  getPersonalDetails(crn: string) {
    return this.peopleOnProbationApiClient.getPersonalDetails(crn)
  }

  getSentences(crn: string) {
    return this.peopleOnProbationApiClient.getSentences(crn)
  }

  getFutureAppointments(crn: string, page = 0, size = 10) {
    return this.peopleOnProbationApiClient.getFutureAppointments(crn, page, size)
  }

  getPastAppointments(crn: string, page = 0, size = 10) {
    return this.peopleOnProbationApiClient.getPastAppointments(crn, page, size)
  }

  validateRegistrationInvite(token: string) {
    return this.peopleOnProbationApiClient.validateRegistrationInvite(token)
  }

  completeOneLoginRegistration(request: CompleteOneLoginRegistrationRequest) {
    return this.peopleOnProbationApiClient.completeOneLoginRegistration(request)
  }

  getCurrentRegisteredUser(request: CurrentRegisteredUserRequest) {
    return this.peopleOnProbationApiClient.getCurrentRegisteredUser(request)
  }
}

let peopleOnProbationService: PeopleOnProbationService | null = null

export function getPeopleOnProbationService() {
  if (peopleOnProbationService) return peopleOnProbationService

  peopleOnProbationService = new PeopleOnProbationService(new PeopleOnProbationApiClient(createAuthenticationClient()))
  return peopleOnProbationService
}
