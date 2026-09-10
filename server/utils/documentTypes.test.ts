import {
  isValidDocumentName,
  isValidDocumentType,
  formatDocumentTypeLabel,
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
})
