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
   * doesn't depend on the page staying alive; falls back to fetch if no
   * beacon sender is configured.
   */
  send(event: AnalyticsEvent, useBeacon = false): void {
    try {
      const body = JSON.stringify({ events: [event] })

      if (useBeacon && this.options.sendBeacon) {
        this.options.sendBeacon(this.options.endpoint, body)
        return
      }

      this.options.sendFetch(this.options.endpoint, body).catch(() => {
        // Best-effort only — no retry
      })
    } catch {
      // Never let a broken network call escape into the page.
    }
  }
}
