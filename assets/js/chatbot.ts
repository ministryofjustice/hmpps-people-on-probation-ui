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

init({
  container: '#chatbot-root',
  apiBaseUrl: '/api/chatbot/chat',
  domain: 'pop',
  config: {
    assistantName: 'Fred',
    displayTitle: 'AI Probation Assistant',
    placeholder: 'Ask a question...',
    welcomeMessage: `Hi, I'm Fred 👋 How can I help you today?

I use information from your probation record to answer your questions. I can't change your record, make decisions about your case or give you legal advice. I may make mistakes.

By continuing, you agree to the [Privacy Notice](#privacy).`,
    suggestedQuestions: ['When is my next appointment?'],
    // Widget rewrites `#privacy` markdown links and the bottom-of-widget
    // link to open this URL in a new tab. `privacyMessage` is no longer
    // needed here — the chatbot's /privacy page is the single source of
    // truth.
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
