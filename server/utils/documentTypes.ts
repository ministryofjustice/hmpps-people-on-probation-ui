import type { DocumentType } from '../data/peopleOnProbationApiClient'

// Citizen-facing label for each document type - centralised here rather than trusting the
// admin-entered `name` field, so the wording citizens see is consistent regardless of what an
// admin typed when uploading.
const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  COURT_ORDER: 'Your Court Order',
}

export function formatDocumentTypeLabel(documentType: DocumentType): string {
  return DOCUMENT_TYPE_LABELS[documentType]
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
const DOCUMENT_NAME_PATTERN = /^[A-Za-z0-9 _'.,:()/-]+$/

export function isValidDocumentName(value: string): boolean {
  return value.length > 0 && value.length <= DOCUMENT_NAME_MAX_LENGTH && DOCUMENT_NAME_PATTERN.test(value)
}
