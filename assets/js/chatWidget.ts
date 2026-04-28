interface ChatMessage {
  role: 'user' | 'bot'
  content: string
  timestamp: Date
}

const SUGGESTED_QUESTIONS = [
  'What happens at my first probation appointment?',
  'Can I travel abroad while on probation?',
  'What are my reporting requirements?',
]

class ChatWidget {
  private container: HTMLElement

  private toggle: HTMLButtonElement

  private panel: HTMLElement

  private messagesEl: HTMLElement

  private input: HTMLInputElement

  private sendBtn: HTMLButtonElement

  private messages: ChatMessage[] = []

  private conversationId: string | null = null

  private isOpen = false

  private isSending = false

  constructor() {
    this.container = this.createElement('div', 'chat-widget')
    this.toggle = this.createToggle()
    this.panel = this.createPanel()
    this.messagesEl = this.panel.querySelector('.chat-widget__messages') as HTMLElement
    this.input = this.panel.querySelector('.chat-widget__input') as HTMLInputElement
    this.sendBtn = this.panel.querySelector('.chat-widget__send') as HTMLButtonElement

    this.container.appendChild(this.panel)
    this.container.appendChild(this.toggle)
    document.body.appendChild(this.container)

    this.bindEvents()
    this.showWelcome()
  }

  private createElement<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag)
    if (className) el.className = className
    return el
  }

  private createToggle(): HTMLButtonElement {
    const btn = this.createElement('button', 'chat-widget__toggle')
    btn.setAttribute('aria-label', 'Open chat')
    btn.setAttribute('type', 'button')
    btn.innerHTML = `
      <svg class="chat-widget__toggle-icon chat-widget__toggle-icon--chat" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
      <svg class="chat-widget__toggle-icon chat-widget__toggle-icon--close" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `
    return btn
  }

  private createPanel(): HTMLElement {
    const panel = this.createElement('div', 'chat-widget__panel')
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-label', 'AI Probation Assistant')
    panel.innerHTML = `
      <div class="chat-widget__header">
        <div class="chat-widget__header-info">
          <div>
            <div class="chat-widget__header-name">Fred</div>
            <div class="chat-widget__header-status">AI Probation Assistant</div>
          </div>
        </div>
        <div class="chat-widget__header-actions">
          <button class="chat-widget__new-chat" type="button" aria-label="New conversation">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
          </button>
          <button class="chat-widget__close" type="button" aria-label="Close chat">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      <div class="chat-widget__messages" aria-live="polite" aria-atomic="false"></div>
      <div class="chat-widget__footer">
        <div class="chat-widget__input-row">
          <input class="chat-widget__input" type="text" placeholder="Ask a question..." aria-label="Chat message" autocomplete="off" />
          <button class="chat-widget__send" type="button" aria-label="Send message" disabled>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"></line>
              <polyline points="5 12 12 5 19 12"></polyline>
            </svg>
          </button>
        </div>
      </div>
    `
    return panel
  }

  private showWelcome(): void {
    this.addBotMessage("Hi, I'm your AI Probation Assistant. How can I help you today?")
    this.showSuggestions()
  }

  private showSuggestions(): void {
    const container = this.createElement('div', 'chat-widget__suggestions')
    for (const q of SUGGESTED_QUESTIONS) {
      const btn = this.createElement('button', 'chat-widget__suggestion')
      btn.setAttribute('type', 'button')
      btn.textContent = q
      btn.addEventListener('click', () => {
        container.remove()
        this.sendMessage(q)
      })
      container.appendChild(btn)
    }
    this.messagesEl.appendChild(container)
    this.scrollToBottom()
  }

  private bindEvents(): void {
    this.toggle.addEventListener('click', () => this.togglePanel())

    const closeBtn = this.panel.querySelector('.chat-widget__close') as HTMLButtonElement
    closeBtn.addEventListener('click', () => this.togglePanel())

    const newChatBtn = this.panel.querySelector('.chat-widget__new-chat') as HTMLButtonElement
    newChatBtn.addEventListener('click', () => this.resetConversation())

    this.input.addEventListener('input', () => {
      this.sendBtn.disabled = !this.input.value.trim() || this.isSending
    })

    this.input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        this.handleSend()
      }
    })

    this.sendBtn.addEventListener('click', () => this.handleSend())

    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.isOpen) this.togglePanel()
    })
  }

  private togglePanel(): void {
    this.isOpen = !this.isOpen
    this.container.classList.toggle('chat-widget--open', this.isOpen)
    this.toggle.setAttribute('aria-label', this.isOpen ? 'Close chat' : 'Open chat')

    if (this.isOpen) {
      this.input.focus()
      this.scrollToBottom()
    }
  }

  private resetConversation(): void {
    this.messages = []
    this.conversationId = null
    this.messagesEl.innerHTML = ''
    this.showWelcome()
    this.input.focus()
  }

  private addBotMessage(text: string): void {
    const msg: ChatMessage = { role: 'bot', content: text, timestamp: new Date() }
    this.messages.push(msg)
    this.renderMessage(msg)
    this.scrollToBottom()
  }

  private addUserMessage(text: string): void {
    const msg: ChatMessage = { role: 'user', content: text, timestamp: new Date() }
    this.messages.push(msg)
    this.renderMessage(msg)
    this.scrollToBottom()
  }

  private renderMessage(msg: ChatMessage): void {
    const wrapper = this.createElement('div', `chat-widget__message chat-widget__message--${msg.role}`)
    const bubble = this.createElement('div', 'chat-widget__bubble')
    bubble.innerHTML = this.escapeHtml(msg.content)
      .replace(/\n{3,}/g, '<br><br>')
      .replace(/\n/g, '<br>')
    wrapper.appendChild(bubble)
    this.messagesEl.appendChild(wrapper)
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  private showTyping(): HTMLElement {
    const wrapper = this.createElement(
      'div',
      'chat-widget__message chat-widget__message--bot chat-widget__message--typing',
    )
    const bubble = this.createElement('div', 'chat-widget__bubble')
    bubble.innerHTML =
      '<span class="chat-widget__dot"></span><span class="chat-widget__dot"></span><span class="chat-widget__dot"></span>'
    wrapper.appendChild(bubble)
    this.messagesEl.appendChild(wrapper)
    this.scrollToBottom()
    return wrapper
  }

  private scrollToBottom(): void {
    requestAnimationFrame(() => {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight
    })
  }

  private sendMessage(text: string): void {
    this.input.value = text
    this.handleSend()
  }

  private async handleSend(): Promise<void> {
    const text = this.input.value.trim()
    if (!text || this.isSending) return

    this.isSending = true
    this.input.value = ''
    this.sendBtn.disabled = true
    this.input.disabled = true

    this.addUserMessage(text)
    const typingEl = this.showTyping()

    try {
      const body: Record<string, string> = { message: text }
      if (this.conversationId) {
        body.conversationId = this.conversationId
      }

      const res = await fetch('/chatbot/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error('Request failed')

      const data = await res.json()
      this.conversationId = data.conversation_id || null

      typingEl.remove()
      this.addBotMessage(data.response)
    } catch {
      typingEl.remove()
      this.addBotMessage('Sorry, something went wrong. Please try again.')
    } finally {
      this.isSending = false
      this.input.disabled = false
      this.sendBtn.disabled = false
      this.input.focus()
    }
  }
}

function bootstrap(): ChatWidget {
  return new ChatWidget()
}

export default function initChatWidget(): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap)
  } else {
    bootstrap()
  }
}
