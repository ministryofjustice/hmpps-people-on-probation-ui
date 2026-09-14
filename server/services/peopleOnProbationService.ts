import PeopleOnProbationApiClient, {
  type CompleteOneLoginRegistrationRequest,
  type CurrentRegisteredUserRequest,
  type AnalyticsEvent,
  type CreateDocumentRequest,
  type DocumentType,
} from '../data/peopleOnProbationApiClient'
import { getAuthenticationClient } from '../data/index'

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

  getFutureAppointments(crn: string, page = 0, size = 50) {
    return this.peopleOnProbationApiClient.getFutureAppointments(crn, page, size)
  }

  getPastAppointments(crn: string, page = 0, size = 50) {
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

  getSentencePlan(crn: string) {
    return this.peopleOnProbationApiClient.getSentencePlan(crn)
  }

  postAnalyticsEvent(event: AnalyticsEvent) {
    return this.peopleOnProbationApiClient.postAnalyticsEvent(event)
  }

  getDocuments(crn: string) {
    return this.peopleOnProbationApiClient.getDocuments(crn)
  }

  getDocument(crn: string, documentId: string) {
    return this.peopleOnProbationApiClient.getDocument(crn, documentId)
  }

  presignDocumentUpload(crn: string, documentType: DocumentType) {
    return this.peopleOnProbationApiClient.presignDocumentUpload(crn, documentType)
  }

  createDocument(crn: string, request: CreateDocumentRequest) {
    return this.peopleOnProbationApiClient.createDocument(crn, request)
  }
}

let peopleOnProbationService: PeopleOnProbationService | null = null

export function getPeopleOnProbationService() {
  if (peopleOnProbationService) return peopleOnProbationService

  peopleOnProbationService = new PeopleOnProbationService(new PeopleOnProbationApiClient(getAuthenticationClient()))

  return peopleOnProbationService
}
