import PeopleOnProbationApiClient, {
  type CompleteOneLoginRegistrationRequest,
  type CurrentRegisteredUserRequest,
  type AnalyticsEvent,
  type CreateDocumentRequest,
  type AppointmentResponse,
  type DocumentType,
} from '../data/peopleOnProbationApiClient'
import { getAuthenticationClient } from '../data/index'

export default class PeopleOnProbationService {
  constructor(private readonly peopleOnProbationApiClient: PeopleOnProbationApiClient) {}

  getName(crn: string, options?: { retries?: number }) {
    return this.peopleOnProbationApiClient.getName(crn, options)
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

  // Every past appointment, in as few calls as possible: one call usually covers everyone. If it
  // doesn't, the first response tells us the total, so a second call asks for exactly that many.
  // If the API caps the page size below the total, the remaining pages are fetched in parallel.
  async getAllPastAppointments(crn: string, initialSize = 100): Promise<AppointmentResponse[]> {
    const first = await this.getPastAppointments(crn, 0, initialSize)
    const total = first.page?.totalElements ?? first.content.length
    if (first.content.length >= total) return first.content

    const all = await this.getPastAppointments(crn, 0, total)
    const returnedCount = all.content.length
    if (returnedCount >= total || returnedCount === 0) return all.content

    // Fewer than asked for: the API capped the page size at returnedCount, so page through the rest at that size.
    const remainingPages = Array.from({ length: Math.ceil(total / returnedCount) - 1 }, (_, i) => i + 1)
    const rest = await Promise.all(remainingPages.map(page => this.getPastAppointments(crn, page, returnedCount)))
    return [...all.content, ...rest.flatMap(response => response.content)]
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
