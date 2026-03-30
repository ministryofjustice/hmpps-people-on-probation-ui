import 'server-only'

import PeopleOnProbationApiClient from '../data/peopleOnProbationApiClient'

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
}
