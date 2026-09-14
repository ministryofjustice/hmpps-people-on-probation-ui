// Clears the persisted chat conversation when the user signs out — on EVERY
// signed-in page, not just /chat. The conversation lives in sessionStorage, so
// if a user signs out from /home, /appointments or the timeout dialog without
// this, the next person to sign in in the same browser tab (e.g. a shared
// device) would have the previous user's probation chat restored.
//
// The keys mirror the widget's session-storage.ts for the "pop" domain. They're
// reimplemented here rather than importing clearChatbotSession from the widget
// so this stays a tiny bundle — importing from the package would pull React and
// the whole widget onto every page. Keep in sync with the widget if it changes.
const SESSION_KEY = 'chatbot_session_v1:widget:pop'
const OPEN_STATE_KEY = 'chatbot_open_state_v1:widget:pop'

document.addEventListener('click', event => {
  const { target } = event
  if (!(target instanceof Element)) return

  const link = target.closest<HTMLAnchorElement>('a')
  if (!link) return

  const url = new URL(link.href)
  if (url.origin === window.location.origin && ['/sign-out', '/admin/sign-out'].includes(url.pathname)) {
    try {
      window.sessionStorage.removeItem(SESSION_KEY)
      window.sessionStorage.removeItem(OPEN_STATE_KEY)
    } catch {
      // sessionStorage can be unavailable in privacy-restricted browser contexts.
    }
  }
})
