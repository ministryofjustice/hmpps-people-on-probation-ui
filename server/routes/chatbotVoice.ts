import express, { Router, Request, Response, NextFunction } from 'express'
import config, { isChatbotVoiceEnabled } from '../config'
import logger from '../../logger'
import { buildSpeechSsml, isSpeechLanguage, SPEECH_LOCALES, SpeechLanguage } from '../utils/speechSsml'
import FixedWindowRateLimiter from '../utils/fixedWindowRateLimiter'

// A chatbot reply is typically 200-600 characters and the longest canned
// replies are under 1000. Cap well above that so no genuine reply is ever cut
// off, while a tampered client can't push pages of arbitrary text through our
// Azure account (synthesis is billed per character).
export const MAX_SPEECH_TEXT_LENGTH = 3000

// The widget caps a recording at ten minutes (a voice message, not a sound
// bite: people who find typing hard may need time to say what they mean). At
// the bitrates browsers record at (Chrome WebM/Opus ~32-48kbps, Safari MP4/AAC
// up to ~128kbps) ten minutes is under 10MB, so 16MB leaves headroom.
export const MAX_RECORDING_SECONDS = 600
export const MAX_AUDIO_BYTES = 16 * 1024 * 1024

// What MediaRecorder produces across browsers, plus WAV. Azure fast
// transcription accepts all of these directly, so no server-side transcoding.
export const AUDIO_CONTENT_TYPES = [
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
]

// Synthesis of one reply takes well under a second; transcription of a long
// recording takes roughly a tenth of its length, so ten minutes of audio needs
// a minute or more.
const TTS_UPSTREAM_TIMEOUT_MS = 20_000
const STT_UPSTREAM_TIMEOUT_MS = 120_000
const TTS_OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'

// Per user, per route, per pod (see FixedWindowRateLimiter). Generous for a
// real conversation — a reply every few seconds for five minutes straight —
// but it stops a stuck or scripted client running up the Azure bill.
const RATE_LIMIT_PER_WINDOW = 60
const RATE_LIMIT_WINDOW_MS = 5 * 60_000

function speechUrls(region: string) {
  return {
    // Neural text-to-speech REST endpoint.
    tts: `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    // "Fast transcription" REST endpoint — synchronous, whole-file, accepts
    // browser audio formats as-is. Preferred over the classic short-audio API
    // which only takes WAV and was less accurate on probation vocabulary.
    stt: `https://${region}.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2024-11-15`,
  }
}

type TranscriptionPayload = {
  durationMilliseconds?: number
  combinedPhrases?: Array<{ text?: string }>
  phrases?: Array<{ text?: string; locale?: string; durationMilliseconds?: number }>
}

function voiceFor(language: SpeechLanguage): string {
  return language === 'cy' ? config.popChatbotVoice.voiceCy : config.popChatbotVoice.voice
}

/**
 * Which of our two languages Azure heard. Fast transcription tags each phrase
 * with the locale it identified (lower- or mixed-case); a recording is treated
 * as Welsh when most of its spoken time is tagged cy-GB. English is the default
 * when nothing was tagged — an empty or unintelligible recording.
 */
export function identifiedLanguage(payload: TranscriptionPayload): SpeechLanguage {
  const spokenMs: Record<SpeechLanguage, number> = { en: 0, cy: 0 }
  for (const phrase of payload.phrases ?? []) {
    const language: SpeechLanguage = (phrase.locale ?? '').toLowerCase().startsWith('cy') ? 'cy' : 'en'
    // Phrases without a duration still count for something, so a tag-only
    // payload is not ignored.
    spokenMs[language] += Math.max(phrase.durationMilliseconds ?? 0, 1)
  }
  return spokenMs.cy > spokenMs.en ? 'cy' : 'en'
}

// Cancel the upstream call if the browser goes away mid-request. The signal
// is the RESPONSE closing before it finished: the request's own 'close' event
// also fires once its body has been fully read, which for a raw audio upload
// parsed inside this router happens right before the handler runs and would
// cancel every transcription.
function abortWhenClientLeaves(res: Response, controller: AbortController): void {
  res.on('close', () => {
    if (!res.writableFinished) controller.abort()
  })
}

function retryLater(res: Response, retryAfterSeconds: number): void {
  res.setHeader('Retry-After', String(retryAfterSeconds))
  res.status(429).json({ error: 'Too many requests' })
}

/**
 * Chatbot voice routes — the server side of "speak a question, hear the answer".
 * Both proxy to Azure AI Speech with the key held server-side; the browser only
 * ever talks to this origin.
 *
 *   POST /api/chatbot/voice/speak       { text, language? }  -> audio/mpeg
 *   POST /api/chatbot/voice/transcribe  <raw audio body>     -> { text, durationMs, language }
 *
 * `language` is 'en' or 'cy'. Transcription asks Azure to identify which of the
 * two the recording is in (one language per recording) and reports it, so the
 * widget can send the text to the chat in that language and later ask for the
 * reply to be read in the matching voice. Nothing else is inferred from the
 * audio: no speaker identification, no profiling.
 *
 * The chat itself is untouched: a transcript goes through the normal /chat
 * route as typed text, so guardrails, context and evals all apply unchanged.
 * Neither route logs the text or transcript — both are the user's personal data.
 */
export default function chatbotVoiceRoutes(): Router {
  const router = Router()
  const speakLimiter = new FixedWindowRateLimiter(RATE_LIMIT_PER_WINDOW, RATE_LIMIT_WINDOW_MS)
  const transcribeLimiter = new FixedWindowRateLimiter(RATE_LIMIT_PER_WINDOW, RATE_LIMIT_WINDOW_MS)

  router.use((req: Request, res: Response, next: NextFunction) => {
    // With the feature dark the routes don't exist, as far as a caller can tell.
    if (!isChatbotVoiceEnabled()) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    if (!res.locals.user) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }
    next()
  })

  router.post('/speak', async (req: Request, res: Response) => {
    const { speechKey, speechRegion } = config.popChatbotVoice
    const { user } = res.locals

    const verdict = speakLimiter.consume(user.userId)
    if (!verdict.allowed) {
      retryLater(res, verdict.retryAfterSeconds)
      return
    }

    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
    if (!text) {
      res.status(400).json({ error: 'text is required' })
      return
    }
    if (text.length > MAX_SPEECH_TEXT_LENGTH) {
      res.status(413).json({ error: 'text is too long' })
      return
    }
    const language: SpeechLanguage = req.body?.language === undefined ? 'en' : req.body.language
    if (!isSpeechLanguage(language)) {
      res.status(400).json({ error: 'language must be en or cy' })
      return
    }
    const voice = voiceFor(language)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TTS_UPSTREAM_TIMEOUT_MS)
    abortWhenClientLeaves(res, controller)

    try {
      const upstream = await fetch(speechUrls(speechRegion).tts, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': speechKey,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': TTS_OUTPUT_FORMAT,
          'User-Agent': 'hmpps-people-on-probation-ui',
        },
        body: buildSpeechSsml(text, voice, language),
        signal: controller.signal,
      })

      if (!upstream.ok || !upstream.body) {
        logger.warn(
          { status: upstream.status, statusText: upstream.statusText },
          'Speech synthesis upstream returned a non-2xx response',
        )
        res.status(502).json({ error: 'Speech service unavailable' })
        return
      }

      res.status(200)
      res.setHeader('Content-Type', 'audio/mpeg')
      res.setHeader('Cache-Control', 'no-store')

      // Stream the audio through as it arrives so playback can start before
      // synthesis has finished. Sequential awaits are inherent to reading a
      // stream, hence the local lint exemption (same pattern as the chat proxy).
      const reader = upstream.body.getReader()
      try {
        for (;;) {
          // eslint-disable-next-line no-await-in-loop
          const { done, value } = await reader.read()
          if (done) break
          if (value) res.write(value)
        }
      } finally {
        reader.releaseLock()
        if (!res.writableEnded) res.end()
      }
    } catch (err) {
      const aborted = (err as { name?: string }).name === 'AbortError'
      if (aborted) logger.warn('Speech synthesis proxy aborted (timeout or client disconnect)')
      else logger.warn({ err }, 'Speech synthesis proxy failed')
      if (!res.headersSent) {
        res.status(aborted ? 504 : 502).json({ error: 'Speech service unavailable' })
      } else if (!res.writableEnded) {
        res.end()
      }
    } finally {
      clearTimeout(timer)
    }
  })

  router.post(
    '/transcribe',
    express.raw({ type: AUDIO_CONTENT_TYPES, limit: MAX_AUDIO_BYTES }),
    async (req: Request, res: Response) => {
      const { speechKey, speechRegion } = config.popChatbotVoice
      const { user } = res.locals

      const verdict = transcribeLimiter.consume(user.userId)
      if (!verdict.allowed) {
        retryLater(res, verdict.retryAfterSeconds)
        return
      }

      // express.raw only parses the content types listed above; anything else
      // leaves no Buffer behind.
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(415).json({ error: 'Unsupported or empty audio' })
        return
      }
      const contentType = String(req.headers['content-type'] ?? '')
        .split(';')[0]
        .trim()

      const form = new FormData()
      // Profanity is left as spoken: the chat guardrails run on the text and
      // need to see what the user actually said, not a masked version.
      form.append('definition', JSON.stringify({ locales: Object.values(SPEECH_LOCALES), profanityFilterMode: 'None' }))
      form.append('audio', new Blob([new Uint8Array(req.body)], { type: contentType }), 'audio')

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), STT_UPSTREAM_TIMEOUT_MS)
      abortWhenClientLeaves(res, controller)

      try {
        const upstream = await fetch(speechUrls(speechRegion).stt, {
          method: 'POST',
          headers: { 'Ocp-Apim-Subscription-Key': speechKey },
          body: form,
          signal: controller.signal,
        })

        if (!upstream.ok) {
          logger.warn(
            { status: upstream.status, statusText: upstream.statusText },
            'Speech transcription upstream returned a non-2xx response',
          )
          res.status(502).json({ error: 'Speech service unavailable' })
          return
        }

        const payload = (await upstream.json()) as TranscriptionPayload
        const text = (payload.combinedPhrases ?? [])
          .map(phrase => phrase.text ?? '')
          .join(' ')
          .trim()

        res.setHeader('Cache-Control', 'no-store')
        res.json({ text, durationMs: payload.durationMilliseconds ?? null, language: identifiedLanguage(payload) })
      } catch (err) {
        const aborted = (err as { name?: string }).name === 'AbortError'
        if (aborted) logger.warn('Speech transcription proxy aborted (timeout or client disconnect)')
        else logger.warn({ err }, 'Speech transcription proxy failed')
        if (!res.headersSent) res.status(aborted ? 504 : 502).json({ error: 'Speech service unavailable' })
      } finally {
        clearTimeout(timer)
      }
    },
  )

  // This is a JSON API: answer body-parser failures (an over-size recording)
  // with JSON rather than falling through to the HTML error page.
  router.use((err: Error & { type?: string }, _req: Request, res: Response, next: NextFunction) => {
    if (err.type === 'entity.too.large') {
      res.status(413).json({ error: 'Audio is too large' })
      return
    }
    next(err)
  })

  return router
}
