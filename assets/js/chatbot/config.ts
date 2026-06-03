import { ChatbotConfig } from './config-types'

export const popConfig: ChatbotConfig = {
  assistantName: 'Fred',
  displayTitle: 'AI Probation Assistant',
  placeholder: 'Ask a question about probation...',
  welcomeMessage: "Hi I'm Fred! How can I help you today?",
  suggestedQuestions: [
    'What happens at my first appointment?',
    'Can I travel abroad on probation?',
    'What are my probation requirements?',
  ],
  privacyMessage: `**About this chatbot**

This is Fred, a chatbot designed to help people on probation understand their sentence, conditions, and obligations. Fred uses information from your probation record — such as your name, order type, conditions, appointments, and probation officer details — to give you answers specific to your situation. In today's session, this information is fictional (not real data).

**How it works**

When you ask Fred a question, your question and your probation details are sent to an AI language model which generates a response. Your conversation is stored so we can improve the service. Fred provides information only — not legal advice. For urgent issues, contact your probation officer directly or call 999 in an emergency.

**How we use your information**

Before we begin, please read our privacy notice:

• Your probation officer will not see the questions you ask or the answers you get.

• Your conversations with this chatbot are stored and may be reviewed to improve this service. This will be stored anonymously and not linked to you. We will delete this information in 90 days.

• This chatbot provides information only — it is not legal advice. For legal advice, please speak to a qualified solicitor.

• Do not share bank details, passwords, or information that could identify other people.

• In an emergency, call 999 or contact your probation officer directly.
`,
}
