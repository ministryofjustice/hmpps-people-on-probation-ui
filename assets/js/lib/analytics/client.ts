import type { AnalyticsEvent } from './events'

export interface QueueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type BeaconSender = (url: string, body: string) => boolean
export type FetchSender = (url: string, body: string) => Promise<{ ok: boolean }>

export type AnalyticsClientOptions = {
  endpoint: string
  storage: QueueStorage
  sendFetch: FetchSender
  sendBeacon?: BeaconSender
  storageKey?: string
  maxBatchSize?: number
}

const DEFAULT_STORAGE_KEY = 'pop-analytics-pending-events'
const DEFAULT_MAX_BATCH_SIZE = 20

/**
 * Queues analytics events and sends them via fetch or sendBeacon when the
 * caller calls flush(). enqueue() never sends anything itself — callers
 * decide when and how (fetch vs beacon) to flush, and multiple events
 * enqueued before one flush() call are naturally sent together as a batch.
 * Unsent events (network failure, non-2xx response, or a rejected beacon)
 * are kept — with their original eventId, never regenerated — in both the
 * in-memory queue and a persisted copy in `storage`, so they're retried on
 * the next flush or, if the page unloaded first, on the next page load
 * that constructs a new client. Every public method swallows its own
 * errors: a broken analytics pipeline must never throw into the caller's
 * page.
 */
export class AnalyticsClient {
  private queue: AnalyticsEvent[]

  constructor(private readonly options: AnalyticsClientOptions) {
    this.queue = this.loadPersistedQueue()
  }

  enqueue(event: AnalyticsEvent): void {
    this.queue.push(event)
    this.persistQueue()
  }

  /**
   * Sends whatever is currently queued (up to maxBatchSize). Pass
   * useBeacon=true when the page is being hidden/unloaded so delivery
   * doesn't depend on the page staying alive.
   */
  flush(useBeacon: boolean): void {
    try {
      if (this.queue.length === 0) return

      const batch = this.queue.slice(0, this.options.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE)
      const body = JSON.stringify({ events: batch })

      if (useBeacon && this.options.sendBeacon) {
        const accepted = this.options.sendBeacon(this.options.endpoint, body)
        if (accepted) this.removeFromQueue(batch)
        return
      }

      this.options
        .sendFetch(this.options.endpoint, body)
        .then(result => {
          if (result.ok) this.removeFromQueue(batch)
        })
        .catch(() => {
          // Leave the queue untouched; it and its persisted copy will be
          // retried on the next flush or page load.
        })
    } catch {
      // Never let a broken storage/network call escape into the page.
    }
  }

  private get storageKey(): string {
    return this.options.storageKey ?? DEFAULT_STORAGE_KEY
  }

  private loadPersistedQueue(): AnalyticsEvent[] {
    try {
      const raw = this.options.storage.getItem(this.storageKey)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  private persistQueue(): void {
    try {
      this.options.storage.setItem(this.storageKey, JSON.stringify(this.queue))
    } catch {
      // Storage full/unavailable (e.g. private browsing) — keep going
      // in-memory for this page load rather than breaking the page.
    }
  }

  private clearPersistedQueue(): void {
    try {
      this.options.storage.removeItem(this.storageKey)
    } catch {
      // as above
    }
  }

  private removeFromQueue(sent: AnalyticsEvent[]): void {
    const sentIds = new Set(sent.map(event => event.eventId))
    this.queue = this.queue.filter(event => !sentIds.has(event.eventId))
    this.persistQueue()
    if (this.queue.length === 0) this.clearPersistedQueue()
  }
}
