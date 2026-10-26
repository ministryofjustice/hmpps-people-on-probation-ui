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
    suggestedQuestions: ["When's my next appointment?", 'How many hours of unpaid work do I have left?'],
    // Widget rewrites `#privacy` markdown links and the bottom-of-widget link
    // to open this URL in a new tab. `privacyMessage` is no longer needed here
    // — the chatbot's /privacy page is the single source of truth.
    privacyUrl: CHATBOT_PRIVACY_URL,
    privacyMessage: null,
  },
})

// Note: clearing the persisted conversation on sign-out lives in
// assets/js/chatbot-signout.ts, which loads on every signed-in page — this
// bundle only loads on /chat, so it can't be relied on to catch sign-outs
// from elsewhere.
