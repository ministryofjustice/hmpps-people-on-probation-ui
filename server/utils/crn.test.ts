import isValidCrnFormat from './crn'

describe('isValidCrnFormat', () => {
  it('accepts a letter followed by six digits', () => {
    expect(isValidCrnFormat('X123456')).toBe(true)
  })

  it('accepts lowercase letters', () => {
    expect(isValidCrnFormat('x123456')).toBe(true)
  })

  it('trims surrounding whitespace before validating', () => {
    expect(isValidCrnFormat('  X123456  ')).toBe(true)
  })

  it('rejects a value with too few digits', () => {
    expect(isValidCrnFormat('X12345')).toBe(false)
  })

  it('rejects a value with too many digits', () => {
    expect(isValidCrnFormat('X1234567')).toBe(false)
  })

  it('rejects a value with no leading letter', () => {
    expect(isValidCrnFormat('1234567')).toBe(false)
  })

  it('rejects a value with more than one leading letter', () => {
    expect(isValidCrnFormat('XX123456')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isValidCrnFormat('')).toBe(false)
  })

  it('rejects a value containing extra characters', () => {
    expect(isValidCrnFormat('X123456; DROP TABLE')).toBe(false)
  })
})
