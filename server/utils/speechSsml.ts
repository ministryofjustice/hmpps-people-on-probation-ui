/**
 * Turns a chatbot reply (markdown) into SSML for Azure neural text-to-speech.
 *
 * The chatbot answers in markdown for the screen. Read aloud verbatim, the
 * markup becomes noise ("asterisk asterisk Samaritans") and phone numbers get
 * read as quantities ("one hundred and sixteen thousand..."). This strips the
 * markup, rewrites the few idioms that only make sense on screen, and marks
 * helpline numbers so the voice reads them digit by digit.
 *
 * English only: the SSML language is fixed to en-GB and the idioms below are
 * English. Revisit if the chatbot's Welsh mode is ever wired to voice.
 */

// UK landline/mobile/freephone with optional spaces (0113 496 0000, 0808 2000 247),
// emergency/short codes (999, 111, 101), the Samaritans' 116 123, and 5-digit SMS
// short codes (text SHOUT to 85258). Deliberately narrow: dates, times, hours
// and years must NOT match, or "64 hours" would be read as a phone number.
const PHONE_NUMBER_RE = /\b(?:0\d{2,4} ?\d{3,4} ?\d{3,4}|116 123|999|111|101|\d{5})\b/g

const PARAGRAPH_BREAK = '<break time="300ms"/>'

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Markdown reply -> plain text that reads naturally when spoken. */
export function markdownToSpeechText(markdown: string): string {
  let text = markdown.replace(/\r\n/g, '\n')
  text = text.replace(/<[^>]+>/g, '') // any raw HTML (the chatbot shouldn't emit it, but don't read it out)
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [link text](url) -> link text
  text = text.replace(/`([^`]*)`/g, '$1') // `code` -> code
  text = text.replace(/(\*\*|__)(.+?)\1/g, '$2') // **bold** -> bold
  text = text.replace(/(?<!\w)([*_])(?!\s)(.+?)(?<!\s)\1(?!\w)/g, '$2') // *italic* -> italic
  text = text.replace(/^#{1,6}\s*/gm, '') // # heading -> heading
  text = text.replace(/^\s*[-*+]\s+/gm, '') // - bullet -> its own line
  text = text.replace(/^\s*\d+\.\s+/gm, '') // 1. item -> its own line
  text = text.replace(/24\/7/g, '24 hours a day, 7 days a week')
  text = text.replace(/\s*\(([^)]*)\)/g, ', $1,') // (aside) -> , aside,
  text = text.replace(/,\s*([.!?])/g, '$1')
  text = text.replace(/,\s*,/g, ',')
  text = text.replace(/,\s*$/gm, '.') // a line that now ends in a comma ends in a full stop instead
  text = text.replace(/[ \t]+/g, ' ')
  text = text.replace(/\n{3,}/g, '\n\n')
  return text.trim()
}

/**
 * Full SSML document for one reply: one <p> per paragraph or list item, a short
 * pause between them, helpline numbers read as telephone digits.
 */
export function buildSpeechSsml(markdown: string, voice: string): string {
  const paragraphs = markdownToSpeechText(markdown)
    .split(/\n+/)
    .map(p => p.trim())
    .filter(Boolean)
  const body = paragraphs
    .map(p => {
      // Escape first, then insert tags: the digits and spaces a phone number is
      // made of are unaffected by escaping, and the tags themselves must not be.
      const spoken = escapeXml(p).replace(PHONE_NUMBER_RE, m => `<say-as interpret-as="telephone">${m}</say-as>`)
      return `<p>${spoken}</p>`
    })
    .join(PARAGRAPH_BREAK)
  return (
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-GB">' +
    `<voice name="${escapeXml(voice)}">${body}</voice></speak>`
  )
}
