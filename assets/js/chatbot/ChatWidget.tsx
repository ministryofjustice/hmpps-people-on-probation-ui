import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createApiClient } from './api-client';
import { defaultConfig, ChatbotConfig } from './config-types';

export type ChatWidgetProps = {
  apiBaseUrl: string;
  domain?: string;
  config?: ChatbotConfig;
  userContext?: Record<string, unknown> | null;
};

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  surveyMessage?: boolean;
  sensitiveContent?: boolean;
  guardrailResults?: Record<string, unknown>;
  evaluationScore?: number;
  sources?: string[];
  feedbackSubmitted?: boolean;
}

type SurveyStep = 'idle' | 'invite' | 'usefulness' | 'reuse' | 'complete';

const markdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => <h1 className="mb-1.5 text-base font-semibold text-neutral-900">{children}</h1>,
  h2: ({ children }: { children?: React.ReactNode }) => <h2 className="mb-1.5 text-sm font-semibold text-neutral-900">{children}</h2>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 className="mb-1 text-sm font-medium text-neutral-900">{children}</h3>,
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-1.5 leading-relaxed last:mb-0">{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="mb-1.5 block list-disc pl-4 space-y-0.5">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="mb-1.5 block list-decimal pl-4 space-y-0.5">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li className="[display:list-item]">{children}</li>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
  code: ({ children }: { children?: React.ReactNode }) => <code className="rounded bg-white border border-neutral-200 px-1 py-0.5 font-mono text-xs">{children}</code>,
  pre: ({ children }: { children?: React.ReactNode }) => <pre className="overflow-x-auto rounded bg-white border border-neutral-200 p-2 text-xs">{children}</pre>,
  blockquote: ({ children }: { children?: React.ReactNode }) => <blockquote className="border-l-2 border-neutral-300 pl-3 italic text-neutral-600">{children}</blockquote>,
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => <a href={href} className="underline hover:no-underline" target="_blank" rel="noopener noreferrer">{children}</a>,
  hr: () => <hr className="my-2 border-neutral-200" />,
};

const markdownComponentsUser = {
  ...markdownComponents,
  h1: ({ children }: { children?: React.ReactNode }) => <h1 className="mb-1.5 text-base font-semibold text-white">{children}</h1>,
  h2: ({ children }: { children?: React.ReactNode }) => <h2 className="mb-1.5 text-sm font-semibold text-white">{children}</h2>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 className="mb-1 text-sm font-medium text-white">{children}</h3>,
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-1.5 leading-relaxed last:mb-0 text-white">{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="mb-1.5 block list-disc pl-4 space-y-0.5 text-white">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="mb-1.5 block list-decimal pl-4 space-y-0.5 text-white">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li className="text-white [display:list-item]">{children}</li>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }: { children?: React.ReactNode }) => <em className="italic text-white">{children}</em>,
  code: ({ children }: { children?: React.ReactNode }) => <code className="rounded bg-white/20 px-1 py-0.5 font-mono text-xs text-white">{children}</code>,
  pre: ({ children }: { children?: React.ReactNode }) => <pre className="overflow-x-auto rounded bg-white/20 p-2 text-xs text-white">{children}</pre>,
  blockquote: ({ children }: { children?: React.ReactNode }) => <blockquote className="border-l-2 border-white/60 pl-3 italic text-white">{children}</blockquote>,
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => <a href={href} className="text-white underline hover:no-underline" target="_blank" rel="noopener noreferrer">{children}</a>,
  hr: () => <hr className="my-2 border-white/40" />,
};

function ChatWidget({ apiBaseUrl, domain = '', config, userContext: userContextProp }: ChatWidgetProps) {
  const configForDomain = config ?? defaultConfig;
  const assistantName = configForDomain.assistantName;
  const privacyMessage = configForDomain.privacyMessage;
  const consentKey = `privacy_accepted_v3:widget:${domain}`;
  const surveyCompletedKey = `chatbot_survey_completed_v1:widget:${domain}`;
  const [privacyAccepted, setPrivacyAccepted] = useState(() => !privacyMessage);
  const [surveyStep, setSurveyStep] = useState<SurveyStep>('idle');
  const [surveySubmitting, setSurveySubmitting] = useState(false);
  const [surveyCompleted, setSurveyCompleted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: configForDomain.welcomeMessage,
      isUser: false,
      timestamp: new Date(),
      sensitiveContent: false,
    },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [pageContext, setPageContext] = useState<Record<string, string> | null>(null);
  const userContext = userContextProp ?? null;
  const [showPrivacy, setShowPrivacy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const widgetClient = createApiClient(apiBaseUrl);
  const assistantReplyCount = messages.filter(
    (message) => !message.isUser && message.id !== '1' && !message.surveyMessage
  ).length;

  // Same-origin mount: context is passed via props by the parent component,
  // no postMessage handshake needed.

  useLayoutEffect(() => {
    try {
      if (privacyMessage && localStorage.getItem(consentKey) === 'true') setPrivacyAccepted(true);
      if (localStorage.getItem(surveyCompletedKey) === 'true') {
        setSurveyCompleted(true);
        setSurveyStep('complete');
      }
    } catch {
      // Ignore localStorage access issues.
    }
  }, [consentKey, privacyMessage, surveyCompletedKey]);

  useEffect(() => {
    if (!privacyAccepted || !privacyMessage) return;
    try {
      localStorage.setItem(consentKey, 'true');
    } catch {
      // Ignore localStorage access issues.
    }
  }, [consentKey, privacyAccepted, privacyMessage]);

  // When the user posts a new message, scroll the messages list so their
  // question sits at the top of the visible area. The assistant's reply then
  // streams in below; user reads top-down rather than chasing the bottom.
  const userMessageCount = messages.filter(m => m.isUser).length;
  useEffect(() => {
    if (userMessageCount === 0) return;
    const last = document.querySelector<HTMLDivElement>('[data-chatbot-user-message]:last-of-type');
    last?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [userMessageCount]);

  const createMessage = (
    text: string,
    isUser: boolean,
    overrides: Partial<Message> = {}
  ): Message => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    isUser,
    timestamp: new Date(),
    ...overrides,
  });

  const addAssistantMessage = (
    text: string,
    overrides: Partial<Message> = {},
    options: { allowSurveyInvite?: boolean } = {}
  ) => {
    const assistantMessage = createMessage(text, false, overrides);
    const shouldInviteSurvey =
      options.allowSurveyInvite &&
      !overrides.surveyMessage &&
      !surveyCompleted &&
      surveyStep === 'idle' &&
      assistantReplyCount >= 4;

    setMessages((prev) =>
      shouldInviteSurvey
        ? [
            ...prev,
            assistantMessage,
            createMessage(
              `Before we continue, could you provide a quick bit of feedback about ${assistantName}? Reply yes or no.`,
              false,
              { surveyMessage: true }
            ),
          ]
        : [...prev, assistantMessage]
    );

    if (shouldInviteSurvey) {
      setSurveyStep('invite');
    }
  };

  const persistSurveyCompleted = () => {
    setSurveyCompleted(true);
    setSurveyStep('complete');
    try {
      localStorage.setItem(surveyCompletedKey, 'true');
    } catch {
      // Ignore localStorage access issues.
    }
  };

  const submitSurveyFeedback = async (feedbackType: string, value: boolean | number | string) => {
    const surveyMessageId = conversationId ? `survey:${conversationId}` : 'survey';
    try {
      await widgetClient.sendFeedback(surveyMessageId, feedbackType, value);
    } catch {
      // Feedback endpoint not exposed by embed API — ignore.
    }
  };

  const isAffirmative = (value: string) => ['y', 'yes', 'yeah', 'yep', 'sure', 'ok', 'okay'].includes(value);
  const isNegative = (value: string) => ['n', 'no', 'nope'].includes(value);
  const isSkip = (value: string) => ['skip', 'not now', 'later'].includes(value);

  const handleSurveyInput = async (rawInput: string): Promise<boolean> => {
    if (surveyStep === 'idle' || surveyStep === 'complete') return false;

    const normalizedInput = rawInput.trim().toLowerCase();
    const userSurveyMessage = createMessage(rawInput.trim(), true, { surveyMessage: true });
    setMessages((prev) => [...prev, userSurveyMessage]);

    if (isSkip(normalizedInput)) {
      await submitSurveyFeedback('message_survey_skipped', true);
      persistSurveyCompleted();
      addAssistantMessage(`No problem. Thanks for chatting with ${assistantName}.`, { surveyMessage: true });
      return true;
    }

    setSurveySubmitting(true);

    try {
      if (surveyStep === 'invite') {
        if (isAffirmative(normalizedInput)) {
          await submitSurveyFeedback('message_survey_opt_in', true);
          setSurveyStep('usefulness');
          addAssistantMessage(
            `Thanks. First question: how useful is ${assistantName}? Reply with a number from 1 to 5, where 1 is not useful and 5 is very useful.`,
            { surveyMessage: true }
          );
          return true;
        }

        if (isNegative(normalizedInput)) {
          await submitSurveyFeedback('message_survey_opt_in', false);
          persistSurveyCompleted();
          addAssistantMessage("No problem. We can carry on whenever you're ready.", { surveyMessage: true });
          return true;
        }

        addAssistantMessage("Please reply yes or no. You can also type skip.", { surveyMessage: true });
        return true;
      }

      if (surveyStep === 'usefulness') {
        const rating = Number.parseInt(normalizedInput, 10);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
          addAssistantMessage("Please reply with a number from 1 to 5. You can also type skip.", {
            surveyMessage: true,
          });
          return true;
        }

        await submitSurveyFeedback('message_survey_usefulness', rating);
        setSurveyStep('reuse');
        addAssistantMessage(`Thanks. One last question: would you use ${assistantName} again? Reply yes or no.`, {
          surveyMessage: true,
        });
        return true;
      }

      if (surveyStep === 'reuse') {
        if (isAffirmative(normalizedInput)) {
          await submitSurveyFeedback('message_survey_use_again', true);
          persistSurveyCompleted();
          addAssistantMessage("Thanks for the feedback. That's really helpful.", { surveyMessage: true });
          return true;
        }

        if (isNegative(normalizedInput)) {
          await submitSurveyFeedback('message_survey_use_again', false);
          persistSurveyCompleted();
          addAssistantMessage("Thanks for the honest feedback. That's really helpful.", { surveyMessage: true });
          return true;
        }

        addAssistantMessage("Please reply yes or no. You can also type skip.", { surveyMessage: true });
        return true;
      }

      return false;
    } finally {
      setSurveySubmitting(false);
    }
  };

  const handleSendMessage = async (overrideMessage?: string) => {
    const source = overrideMessage ?? inputMessage;
    if (!source.trim() || isLoading || surveySubmitting) return;

    const trimmedMessage = source.trim();
    if (overrideMessage === undefined) setInputMessage('');

    if (await handleSurveyInput(trimmedMessage)) {
      return;
    }

    const userMessage: Message = createMessage(trimmedMessage, true);
    const streamingId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      await widgetClient.chatWithAIStream(
        trimmedMessage,
        (chunk) => {
          setIsLoading(false);
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === streamingId);
            if (!exists) {
              return [...prev, { id: streamingId, text: chunk, isUser: false, timestamp: new Date() }];
            }
            return prev.map((m) => m.id === streamingId ? { ...m, text: m.text + chunk } : m);
          });
        },
        (data) => {
          const finalText = data.final_text;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamingId
                ? { ...m, text: finalText ?? m.text, sources: data.sources }
                : m
            )
          );
          setConversationId(data.conversation_id);
        },
        (errText) => {
          setIsLoading(false);
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === streamingId);
            if (!exists) {
              return [...prev, { id: streamingId, text: errText, isUser: false, timestamp: new Date() }];
            }
            return prev.map((m) => m.id === streamingId ? { ...m, text: errText } : m);
          });
        },
        conversationId || undefined,
        domain,
        userContext ?? undefined,
      );
    } catch (error) {
      console.error('Error sending message:', error);
      setIsLoading(false);
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === streamingId);
        const errMsg = "I'm sorry, I'm having trouble connecting right now. Please try again in a moment.";
        if (!exists) {
          return [...prev, { id: streamingId, text: errMsg, isUser: false, timestamp: new Date() }];
        }
        return prev.map((m) => m.id === streamingId ? { ...m, text: errMsg } : m);
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearConversation = async () => {
    if (conversationId) {
      try {
        await widgetClient.clearConversation(conversationId);
      } catch {
        // Clear-conversation endpoint not exposed by embed API — ignore.
      }
    }
    setMessages([
      {
        id: '1',
        text: configForDomain.welcomeMessage,
        isUser: false,
        timestamp: new Date(),
        sensitiveContent: false,
      },
    ]);
    setConversationId(null);
    setSurveyStep(surveyCompleted ? 'complete' : 'idle');
  };

  const handleFeedback = async (
    messageId: string,
    feedbackType: 'thumbs_up' | 'thumbs_down',
    value: boolean
  ) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId ? { ...msg, feedbackSubmitted: true } : msg
      )
    );
    try {
      await widgetClient.sendFeedback(messageId, feedbackType, value);
    } catch {
      // Feedback endpoint not exposed by embed API — keep the UI optimistic.
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, feedbackSubmitted: false } : msg
        )
      );
    }
  };

  const showWelcomeOnly = messages.length === 1 && !messages[0].isUser;

  if (!privacyAccepted && privacyMessage) {
    return (
      <div className="flex h-full flex-col bg-white px-4 py-6">
        <h1 className="shrink-0 text-base font-bold text-neutral-900 whitespace-pre-line">{configForDomain.displayTitle}</h1>
        <div className="mt-4 flex-1 min-h-0 overflow-y-auto rounded-2xl border border-neutral-200 bg-white px-4 py-4">
          <div className="prose prose-base max-w-none text-neutral-700">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {privacyMessage}
            </ReactMarkdown>
          </div>
        </div>
        <button
          onClick={() => setPrivacyAccepted(true)}
          className="mt-4 shrink-0 rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          I agree
        </button>
      </div>
    );
  }

  if (showPrivacy && privacyMessage) {
    return (
      <div className="flex h-full flex-col bg-white">
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-3">
          <h2 className="text-base font-bold text-neutral-900">Privacy notice</h2>
          <button
            type="button"
            onClick={() => setShowPrivacy(false)}
            aria-label="Back to chat"
            className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          <div className="prose prose-base max-w-none text-neutral-700">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {privacyMessage}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col bg-white">
      {/* Minimal header */}
      <div className="flex shrink-0 items-center justify-between px-4 py-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 leading-tight">{configForDomain.assistantName}</h1>
          <p className="mt-0.5 text-base text-neutral-500 leading-tight">{configForDomain.displayTitle}</p>
        </div>
        {conversationId && (
          <button
            onClick={clearConversation}
            aria-label="New conversation"
            title="New conversation"
            className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582M20 20v-5h-.581M5.062 14a8 8 0 0014.395 2M18.938 10A8 8 0 004.543 8" />
            </svg>
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 [scrollbar-gutter:stable]">
        {showWelcomeOnly ? (
          <div>
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md border border-neutral-200 bg-white px-4 py-2.5 max-w-[85%]">
                <div className="prose prose-base max-w-none text-neutral-700 text-left">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {messages[0].text}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
            {configForDomain.suggestedQuestions && configForDomain.suggestedQuestions.length > 0 && (
              <div style={{ marginTop: '24px' }} className="flex flex-col items-end gap-2">
                {configForDomain.suggestedQuestions.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => handleSendMessage(question)}
                    disabled={isLoading || surveySubmitting}
                    style={{ backgroundColor: '#1d70b8', color: '#ffffff' }}
                    className="w-fit max-w-full rounded-2xl rounded-br-md px-4 py-2 text-right text-base transition-colors hover:opacity-90 disabled:opacity-50"
                  >
                    {question}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
              >
                {message.isUser ? (
                  <div data-chatbot-user-message style={{ backgroundColor: '#1d70b8', color: '#ffffff' }} className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5">
                    <div style={{ color: '#ffffff' }} className="prose prose-base max-w-none [&_p]:text-white [&_strong]:text-white [&_h1]:text-white [&_h2]:text-white [&_h3]:text-white">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponentsUser}>
                        {message.text}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-neutral-200 bg-white px-4 py-2.5 text-neutral-800">
                    {message.sensitiveContent && (
                      <p className="mb-2 text-xs font-medium text-amber-700">Sensitive content detected</p>
                    )}
                    {message.guardrailResults &&
                      Object.entries(message.guardrailResults).map(([type, result]: [string, unknown]) => {
                        const gr = result as { action_taken?: string; reason?: string };
                        if (gr.action_taken === 'warn' || gr.action_taken === 'disclaimer') {
                          return <p key={type} className="mb-2 text-xs text-amber-700">{gr.reason}</p>;
                        }
                        return null;
                      })}
                    <div className="prose prose-base max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                        {message.text}
                      </ReactMarkdown>
                    </div>
                    {message.id !== '1' && !message.surveyMessage && !message.feedbackSubmitted && (
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => handleFeedback(message.id, 'thumbs_up', true)}
                          className="text-neutral-400 hover:text-neutral-600 transition-colors"
                          aria-label="Helpful"
                        >
                          <span className="text-sm">👍</span>
                        </button>
                        <button
                          onClick={() => handleFeedback(message.id, 'thumbs_down', false)}
                          className="text-neutral-400 hover:text-neutral-600 transition-colors"
                          aria-label="Not helpful"
                        >
                          <span className="text-sm">👎</span>
                        </button>
                      </div>
                    )}
                    {message.id !== '1' && !message.surveyMessage && message.feedbackSubmitted && (
                      <p className="mt-2 text-[11px] text-neutral-400">Thanks for your feedback</p>
                    )}
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400 [animation-delay:0.2s]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400 [animation-delay:0.4s]" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input: single box with arrow inside */}
      <div className="shrink-0 px-4 py-3">
        <div className="flex min-h-[44px] items-end rounded-xl border border-neutral-200 bg-white focus-within:border-neutral-300 focus-within:ring-1 focus-within:ring-neutral-300">
          <label htmlFor="chat-input-widget" className="sr-only">{configForDomain.placeholder}</label>
          <textarea
            id="chat-input-widget"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={configForDomain.placeholder}
            rows={1}
            disabled={isLoading || surveySubmitting}
            className="min-h-[42px] flex-1 resize-none border-0 bg-transparent px-4 py-2.5 text-base text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-0 disabled:opacity-60"
            style={{ maxHeight: '120px' }}
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={!inputMessage.trim() || isLoading || surveySubmitting}
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-r-[11px] bg-neutral-900 text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            aria-label="Send"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
      {privacyMessage && (
        <div className="flex shrink-0 items-center justify-center border-t border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-600">
          <span className="text-center">
            By using {configForDomain.assistantName} you agree to our{' '}
            <button
              type="button"
              onClick={() => setShowPrivacy(true)}
              className="cursor-pointer text-neutral-900 underline underline-offset-2 hover:text-neutral-700"
            >
              privacy notice
            </button>
            .
          </span>
        </div>
      )}
    </div>
  );
}

export default ChatWidget;
