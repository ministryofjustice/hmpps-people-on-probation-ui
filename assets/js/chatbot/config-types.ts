export interface ChatbotConfig {
  assistantName: string;
  displayTitle: string;
  welcomeMessage: string;
  placeholder: string;
  privacyMessage: string | null;
  suggestedQuestions?: string[];
}

export const defaultConfig: ChatbotConfig = {
  assistantName: 'Assistant',
  displayTitle: 'Assistant',
  welcomeMessage: 'Hi, how can I help you today?',
  placeholder: 'Ask a question...',
  privacyMessage: null,
  suggestedQuestions: [],
};
