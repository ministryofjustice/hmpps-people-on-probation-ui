export type PopChatbotConfig = {
  title: string
  closeLabel: string
  resetLabel: string
  inputPlaceholder: string
  sendLabel: string
}

const scenarioTwoChatbot: PopChatbotConfig = {
  title: 'Ask Fred',
  closeLabel: 'Close',
  resetLabel: 'Reset',
  inputPlaceholder: 'Type a message...',
  sendLabel: 'Send',
}

const chatbotByCrn: Record<string, PopChatbotConfig> = {
  X975563: scenarioTwoChatbot,
}

export function getPopChatbotConfig(crn: string) {
  return chatbotByCrn[crn] ?? null
}

export function getPopChatbotStorageKey(crn: string) {
  return `pop-chatbot-open:${crn}`
}

export function getPopChatbotConversationStorageKey(crn: string) {
  return `pop-chatbot-conversation:${crn}`
}
