import { init } from '@justiceaiunit/chatbot-widget'
import '@justiceaiunit/chatbot-widget/style.css'

// Privacy notice URL — points at the chatbot's own /privacy page, which
// renders the full notice with proper typography and a back-link to POP UI.
// Picked at runtime based on POP UI's own hostname so dev POP UI links to
// the dev chatbot /privacy page and prod POP UI links to prod. Preprod
// (and any unknown host) fall back to prod, since the chatbot itself has
// no preprod deployment and content is identical anyway.
const PROD_CHATBOT_PRIVACY_URL = 'https://probationchatbot-prod.apps.live.cloud-platform.service.justice.gov.uk/privacy'
const DEV_CHATBOT_PRIVACY_URL = 'https://probationchatbot-dev.apps.live.cloud-platform.service.justice.gov.uk/privacy'
const CHATBOT_PRIVACY_URL =
  typeof window !== 'undefined' && /(^|\.)probation-account-dev\./.test(window.location.host)
    ? DEV_CHATBOT_PRIVACY_URL
    : PROD_CHATBOT_PRIVACY_URL

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
    suggestedQuestions: [
      'What happens at my first appointment?',
      'Can I travel abroad?',
      'What are my order requirements?',
    ],
    // Widget rewrites `#privacy` markdown links and the bottom-of-widget
    // link to open this URL in a new tab. `privacyMessage` is no longer
    // needed here — the chatbot's /privacy page is the single source of
    // truth.
    privacyUrl: CHATBOT_PRIVACY_URL,
    privacyMessage: null,
  },
})
