import { clearChatbotSession, init } from '@justiceaiunit/chatbot-widget'
import '@justiceaiunit/chatbot-widget/style.css'

// Privacy notice URL — points at the chatbot's own /privacy page, which
// renders the full notice with proper typography and a back-link to POP UI.
// Hardcoded to the prod chatbot host so this bundle can ship unchanged
// across POP UI envs (content is identical dev/prod; only the back-link
// destination differs, which the chatbot page picks based on its own
// host). If we later want dev POP UI to link at dev chatbot's page,
// switch to a server-templated value.
const CHATBOT_PRIVACY_URL = 'https://probationchatbot-prod.apps.live.cloud-platform.service.justice.gov.uk/privacy'

// This bundle only loads on the dedicated /chat page (see pages/chat.njk),
// which already renders the real GOV.UK header + service nav. So the widget
// hides its own header (hideHeader) and fills the content area beneath it —
// one consistent GOV.UK header and one menu across the whole service.
init({
  container: '#chatbot-root',
  apiBaseUrl: '/api/chatbot/chat',
  domain: 'pop',
  inline: true,
  hideHeader: true,
  config: {
    assistantName: 'Fred',
    // Fallback greeting; the server templates a per-user "Hi, <first name>"
    // via data-display-title on #chatbot-root.
    displayTitle: 'Hi there',
    placeholder: 'Ask a question...',
    // One-liner shown under the greeting on the home screen. The markdown link
    // drops the user straight to the account homepage.
    welcomeMessage:
      "I'm Fred, your AI Assistant. Ask me questions about your probation or [use the website instead](/home).",
    // Keep the conversation across navigation so returning to /chat from an
    // account page doesn't lose it.
    persistSession: true,
    suggestedQuestions: [
      "When's my next appointment?",
      'How many hours of unpaid work do I have left?',
      'What are my order requirements?',
    ],
    // Widget rewrites `#privacy` markdown links and the bottom-of-widget link
    // to open this URL in a new tab. `privacyMessage` is no longer needed here
    // — the chatbot's /privacy page is the single source of truth.
    privacyUrl: CHATBOT_PRIVACY_URL,
    privacyMessage: null,
  },
})

document.addEventListener('click', event => {
  const { target } = event
  if (!(target instanceof Element)) return

  const link = target.closest<HTMLAnchorElement>('a')
  if (!link) return

  const url = new URL(link.href)
  if (url.origin === window.location.origin && ['/sign-out', '/admin/sign-out'].includes(url.pathname)) {
    clearChatbotSession('pop')
  }
})
