import { init } from '@justiceaiunit/chatbot-widget'
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
    // Used mid-sentence by the widget's feedback survey ("…feedback about the AI assistant?").
    assistantName: 'the AI assistant',
    // Fallback greeting; the server templates a per-user "Hi, <first name>"
    // via data-display-title on #chatbot-root.
    displayTitle: 'Hi there',
    placeholder: 'Ask a question...',
    // Welcome copy agreed with the service (25 Nov 2026). It mirrors the online
    // check-ins welcome minus the personal-data line (this service does use
    // personal data) and minus any list of what the assistant can answer, so
    // it stays accurate as navigation changes. "#privacy" opens privacyUrl.
    welcomeMessage: [
      "Hi, I'm the AI assistant.",
      'I can help you by answering questions about your probation.',
      'I am not a human, I may make mistakes.',
      'Anything you ask in here:\n\n' +
        '- will not be passed on to your probation officer\n' +
        '- cannot be used as proof of contacting your probation officer',
      'By continuing, you agree to our [privacy notice (opens in new tab)](#privacy).',
    ].join('\n\n'),
    // Keep the conversation across navigation so returning to /chat from an
    // account page doesn't lose it.
    persistSession: true,
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
