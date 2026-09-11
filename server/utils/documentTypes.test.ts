import type { DocumentType } from '../data/peopleOnProbationApiClient'
import {
  isValidDocumentName,
  isValidDocumentType,
  formatDocumentTypeLabel,
  isS3KeyForCrn,
  DOCUMENT_NAME_MAX_LENGTH,
} from './documentTypes'

describe('isValidDocumentName', () => {
  it('accepts letters, numbers, spaces and underscores', () => {
    expect(isValidDocumentName('Community_order 12 January 2026')).toBe(true)
  })

  it('rejects an empty string', () => {
    expect(isValidDocumentName('')).toBe(false)
  })

  it(`accepts exactly ${DOCUMENT_NAME_MAX_LENGTH} characters`, () => {
    expect(isValidDocumentName('a'.repeat(DOCUMENT_NAME_MAX_LENGTH))).toBe(true)
  })

  it(`rejects more than ${DOCUMENT_NAME_MAX_LENGTH} characters`, () => {
    expect(isValidDocumentName('a'.repeat(DOCUMENT_NAME_MAX_LENGTH + 1))).toBe(false)
  })

  it('rejects a value containing a script tag', () => {
    expect(isValidDocumentName('<script>alert(1)</script>')).toBe(false)
  })

  it('accepts standard punctuation such as hyphens, apostrophes, commas, full stops, colons, parentheses and slashes', () => {
    expect(isValidDocumentName("O'Brien's Community order - 12/01/2026 (draft, v2.1)")).toBe(true)
  })

  it('rejects characters outside the standard punctuation allowlist, such as angle brackets', () => {
    expect(isValidDocumentName('<not allowed>')).toBe(false)
  })
})

describe('isValidDocumentType', () => {
  it('accepts a known document type', () => {
    expect(isValidDocumentType('COURT_ORDER')).toBe(true)
  })

  it('rejects an unrecognised value', () => {
    expect(isValidDocumentType('NOT_A_REAL_TYPE')).toBe(false)
  })

  it('rejects a non-string value', () => {
    expect(isValidDocumentType(undefined)).toBe(false)
  })
})

describe('formatDocumentTypeLabel', () => {
  it('returns the citizen-facing label for a court order', () => {
    expect(formatDocumentTypeLabel('COURT_ORDER')).toBe('Your Court Order')
  })

  it('falls back to a generic label for a document type this UI does not recognise', () => {
    expect(formatDocumentTypeLabel('SOME_FUTURE_TYPE' as DocumentType)).toBe('Document')
  })
})

describe('isS3KeyForCrn', () => {
  it('accepts a key whose CRN segment matches', () => {
    expect(isS3KeyForCrn('court-orders/X123456/3f1b1e5e-6c1a-4a3a-9b1a-1e6b2b7a9c9e.pdf', 'X123456')).toBe(true)
  })

  it('rejects a key belonging to a different CRN', () => {
    expect(isS3KeyForCrn('court-orders/X999999/3f1b1e5e-6c1a-4a3a-9b1a-1e6b2b7a9c9e.pdf', 'X123456')).toBe(false)
  })

  it('rejects a key with the wrong number of segments', () => {
    expect(isS3KeyForCrn('X123456/doc-1.pdf', 'X123456')).toBe(false)
  })
})
