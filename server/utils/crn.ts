// NDelius CRN format: one letter followed by six digits, e.g. "X123456".
// This is just fast input sanitisation before hitting the backend — the
// API's own "not found" response is the authoritative existence check.
const CRN_PATTERN = /^[A-Za-z]\d{6}$/

export default function isValidCrnFormat(value: string): boolean {
  return CRN_PATTERN.test(value.trim())
}
