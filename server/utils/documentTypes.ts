import type { DocumentType } from '../data/peopleOnProbationApiClient'

// Citizen-facing label for each document type - centralised here rather than trusting the
// admin-entered `name` field, so the wording citizens see is consistent regardless of what an
// admin typed when uploading.
const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  COURT_ORDER: 'Your Court Order',
}

// documentType comes from the API response at runtime, so isn't actually guaranteed to be one
// of the values the DocumentType union promises at compile time (e.g. the API adds a type this
// UI doesn't know about yet) - falling back to a generic label avoids an empty card title and
// an "undefined – ..." page title.
export function formatDocumentTypeLabel(documentType: DocumentType): string {
  return DOCUMENT_TYPE_LABELS[documentType] ?? 'Document'
}

// Options for the admin upload form's document type dropdown.
export const DOCUMENT_TYPE_UPLOAD_OPTIONS: { value: DocumentType; text: string }[] = [
  { value: 'COURT_ORDER', text: 'Court order' },
]

const VALID_DOCUMENT_TYPES = new Set<string>(DOCUMENT_TYPE_UPLOAD_OPTIONS.map(option => option.value))

export function isValidDocumentType(value: unknown): value is DocumentType {
  return typeof value === 'string' && VALID_DOCUMENT_TYPES.has(value)
}

// Matches the API's CreateDocumentRequest.name constraints exactly (@Size(max = 255) +
// @Pattern "^[A-Za-z0-9 _'.,:()/-]+$") - checking it here too is fast input sanitisation
// before hitting the backend, not a substitute for the API's own validation.
export const DOCUMENT_NAME_MAX_LENGTH = 255
const DOCUMENT_NAME_PATTERN = /^[A-Za-z0-9 _'.,:()/-]+$/ // gitleaks:allow - validation regex, not a secret

export function isValidDocumentName(value: string): boolean {
  return value.length > 0 && value.length <= DOCUMENT_NAME_MAX_LENGTH && DOCUMENT_NAME_PATTERN.test(value)
}

// The API mints s3Key as {typePrefix}/{crn}/{uuid}.{extension} (see presignUpload) and rejects
// anything else on create - that's the actual security boundary, since s3Key is client-supplied
// on confirm and a tampered/replayed value could otherwise point at another person's file. This
// check is fast, client-facing feedback only, not a substitute for that server-side check - it
// deliberately doesn't hardcode a type prefix (that mapping lives API-side against DocumentType)
// so it just confirms the key's CRN segment matches, regardless of type.
export function isS3KeyForCrn(s3Key: string, crn: string): boolean {
  const segments = s3Key.split('/')
  return segments.length === 3 && segments[1] === crn
}
