/**
 * Minimal in-memory fixed-window rate limiter, keyed by caller.
 *
 * In-memory means per pod: with N replicas a determined caller can get up to
 * N times the limit. That is fine for what this guards (bounding Azure Speech
 * spend from one signed-in session, where the limit is generous anyway) but it
 * is a cost control, not a security control. Move to Redis if that changes.
 */
export default class FixedWindowRateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>()

  private readonly limit: number

  private readonly windowMs: number

  private readonly now: () => number

  constructor(limit: number, windowMs: number, now: () => number = Date.now) {
    this.limit = limit
    this.windowMs = windowMs
    this.now = now
  }

  /** Records a hit for `key`. When refused, `retryAfterSeconds` says how long until the window resets. */
  consume(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = this.now()
    this.sweepExpired(now)
    const entry = this.hits.get(key)
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs })
      return { allowed: true, retryAfterSeconds: 0 }
    }
    if (entry.count >= this.limit) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) }
    }
    entry.count += 1
    return { allowed: true, retryAfterSeconds: 0 }
  }

  // Keep memory bounded without a timer: only bother sweeping once the map is large.
  private sweepExpired(now: number): void {
    if (this.hits.size < 1000) return
    this.hits.forEach((entry, key) => {
      if (entry.resetAt <= now) this.hits.delete(key)
    })
  }
}
