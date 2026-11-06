import { buildSpeechSsml, escapeXml, markdownToSpeechText } from './speechSsml'

// Real deterministic crisis replies from the chatbot backend (crisis_responses.py).
const SUICIDE_REPLY =
  "If you're having thoughts of suicide or self-harm, please reach out now:\n\n" +
  '- **Samaritans**: 116 123 (free, 24/7)\n' +
  '- **Shout Crisis Text Line**: text SHOUT to 85258'

const DOMESTIC_ABUSE_REPLY =
  "If you're experiencing domestic abuse, please contact:\n\n" +
  '- **National Domestic Abuse Hotline**: 0808 2000 247 (free, 24/7)\n' +
  '- **In immediate danger**: call 999'

const APPOINTMENT_REPLY =
  'Your next appointment is on **Tuesday 14 October at 10:30am** at Leeds Probation Office.\n\n' +
  "If you can't make it, call the office on **0113 496 0000**. " +
  'You can also [see all your appointments](/appointments).'

describe('markdownToSpeechText', () => {
  it('strips bold, links and bullets and rewrites screen-only idioms', () => {
    expect(markdownToSpeechText(SUICIDE_REPLY)).toBe(
      "If you're having thoughts of suicide or self-harm, please reach out now:\n" +
        'Samaritans: 116 123, free, 24 hours a day, 7 days a week.\n' +
        'Shout Crisis Text Line: text SHOUT to 85258',
    )
  })

  it('keeps link text but drops the destination', () => {
    expect(markdownToSpeechText(APPOINTMENT_REPLY)).toContain('You can also see all your appointments.')
    expect(markdownToSpeechText(APPOINTMENT_REPLY)).not.toContain('/appointments')
  })

  it('removes headings, numbered lists, inline code, italics and raw HTML', () => {
    expect(markdownToSpeechText('## Next steps\n1. Call *today*\n2. Bring `ID`\n<b>Thanks</b>')).toBe(
      'Next steps\nCall today\nBring ID\nThanks',
    )
  })

  it('does not treat a multiplication-style asterisk or snake_case as emphasis', () => {
    expect(markdownToSpeechText('2 * 3 and your_order')).toBe('2 * 3 and your_order')
  })
})

describe('buildSpeechSsml', () => {
  it('reads helpline numbers, 999 and SMS short codes as telephone digits', () => {
    const ssml = buildSpeechSsml(SUICIDE_REPLY, 'en-GB-RyanNeural')
    expect(ssml).toContain('<say-as interpret-as="telephone">116 123</say-as>')
    expect(ssml).toContain('<say-as interpret-as="telephone">85258</say-as>')

    const abuse = buildSpeechSsml(DOMESTIC_ABUSE_REPLY, 'en-GB-RyanNeural')
    expect(abuse).toContain('<say-as interpret-as="telephone">0808 2000 247</say-as>')
    expect(abuse).toContain('<say-as interpret-as="telephone">999</say-as>')
  })

  it('reads landline numbers as digits but leaves dates, times and hour counts alone', () => {
    const ssml = buildSpeechSsml(`${APPOINTMENT_REPLY}\n\nYou have **64 hours** left out of 120.`, 'en-GB-RyanNeural')
    expect(ssml).toContain('<say-as interpret-as="telephone">0113 496 0000</say-as>')
    expect(ssml).toContain('Tuesday 14 October at 10:30am')
    expect(ssml).toContain('64 hours')
    expect(ssml).toContain('out of 120.')
    expect(ssml.match(/<say-as/g)).toHaveLength(1)
  })

  it('wraps each paragraph or list item in <p> with a pause between them', () => {
    const ssml = buildSpeechSsml(SUICIDE_REPLY, 'en-GB-RyanNeural')
    expect(ssml.match(/<p>/g)).toHaveLength(3)
    expect(ssml.match(/<break time="300ms"\/>/g)).toHaveLength(2)
  })

  it('escapes XML special characters in the reply and the voice name', () => {
    const ssml = buildSpeechSsml('Fish & chips <b>tonight</b>? "Yes" it\'s on', 'en-GB-Ryan<Neural>')
    expect(ssml).toContain('Fish &amp; chips tonight? &quot;Yes&quot; it&apos;s on')
    expect(ssml).toContain('<voice name="en-GB-Ryan&lt;Neural&gt;">')
    expect(ssml).not.toContain('<b>')
  })

  it('fixes the document language to British English', () => {
    expect(buildSpeechSsml('Hello', 'en-GB-RyanNeural')).toMatch(/^<speak version="1.0" [^>]*xml:lang="en-GB">/)
  })

  it('switches the document language and the spoken idioms for Welsh replies', () => {
    const ssml = buildSpeechSsml('**Samariaid**: 116 123 (am ddim, 24/7)', 'cy-GB-NiaNeural', 'cy')
    expect(ssml).toMatch(/^<speak version="1.0" [^>]*xml:lang="cy-GB">/)
    expect(ssml).toContain('<voice name="cy-GB-NiaNeural">')
    expect(ssml).toContain(
      'Samariaid: <say-as interpret-as="telephone">116 123</say-as>, am ddim, 24 awr y dydd, 7 diwrnod yr wythnos.',
    )
    expect(ssml).not.toContain('24 hours')
  })
})

describe('escapeXml', () => {
  it('escapes the five XML special characters', () => {
    expect(escapeXml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;')
  })
})
