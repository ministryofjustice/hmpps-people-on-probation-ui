const typography = require('@tailwindcss/typography')

/** @type {import('tailwindcss').Config} */
module.exports = {
  // Scope every Tailwind selector to #chatbot-root so styles can't bleed
  // into GOV.UK Frontend (and vice versa).
  important: '#chatbot-root',
  // Don't reset/normalise the page — only style what we explicitly add.
  corePlugins: {
    preflight: false,
  },
  content: ['./assets/js/chatbot/**/*.{ts,tsx}', './assets/js/chatbot.tsx'],
  theme: {
    extend: {
      colors: {
        govuk: {
          blue: '#1d70b8',
          'blue-dark': '#155785',
        },
      },
    },
  },
  plugins: [typography],
}
