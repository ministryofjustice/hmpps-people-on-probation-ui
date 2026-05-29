export default function normaliseReturnTo(returnTo?: string | null): string {
  if (!returnTo?.startsWith('/') || returnTo.startsWith('//') || returnTo.includes('\\')) return '/'
  return returnTo
}
