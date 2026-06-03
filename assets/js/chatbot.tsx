import { createRoot } from 'react-dom/client'
import FloatingChatbot from './chatbot/FloatingChatbot'
import popConfig from './chatbot/config'
import '../styles/chatbot.css'

const root = document.getElementById('chatbot-root')
if (root) {
  createRoot(root).render(
    <FloatingChatbot apiBaseUrl="/api/chatbot/chat" domain="pop" config={popConfig} />,
  )
}
