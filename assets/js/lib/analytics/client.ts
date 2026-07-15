import type { AnalyticsEvent } from './events'

export type BeaconSender = (url: string, body: string) => boolean
export type FetchSender = (url: string, body: string) => Promise<{ ok: boolean }>

export type AnalyticsClientOptions = {
  endpoint: string
  sendFetch: FetchSender
  sendBeacon?: BeaconSender
}

export class AnalyticsClient {
  constructor(private readonly options: AnalyticsClientOptions) {}

  /**
   * Pass useBeacon=true when the page is being hidden/unloaded so delivery
   * doesn't depend on the page staying alive. Falls back to fetch if no
   * beacon sender is configured, or if the beacon itself refuses to queue
   * the payload (returns false — e.g. the browser's per-origin pending-
   * beacon queue is full, or the payload is over its size limit). fetch
   * with keepalive is a different delivery mechanism with different
   * constraints, so it stands a real chance of getting through even when
   * the beacon declined.
   */
  send(event: AnalyticsEvent, useBeacon = false): void {
    try {
      const body = JSON.stringify(event)

      if (useBeacon && this.options.sendBeacon) {
        const accepted = this.options.sendBeacon(this.options.endpoint, body)
        if (accepted) return
      }

      this.options.sendFetch(this.options.endpoint, body).catch(() => {
        // Best-effort only — no retry
      })
    } catch {
      // Never let a broken network call escape into the page.
    }
  }
}
