import FixedWindowRateLimiter from './fixedWindowRateLimiter'

describe('FixedWindowRateLimiter', () => {
  let clock: number
  const now = () => clock

  beforeEach(() => {
    clock = 1_000_000
  })

  it('allows up to the limit in a window, then refuses with a retry-after', () => {
    const limiter = new FixedWindowRateLimiter(3, 60_000, now)
    expect(limiter.consume('u1')).toEqual({ allowed: true, retryAfterSeconds: 0 })
    expect(limiter.consume('u1')).toEqual({ allowed: true, retryAfterSeconds: 0 })
    expect(limiter.consume('u1')).toEqual({ allowed: true, retryAfterSeconds: 0 })

    clock += 15_000
    expect(limiter.consume('u1')).toEqual({ allowed: false, retryAfterSeconds: 45 })
  })

  it('starts a fresh window once the previous one has expired', () => {
    const limiter = new FixedWindowRateLimiter(1, 60_000, now)
    expect(limiter.consume('u1').allowed).toBe(true)
    expect(limiter.consume('u1').allowed).toBe(false)

    clock += 60_000
    expect(limiter.consume('u1').allowed).toBe(true)
  })

  it('tracks keys independently', () => {
    const limiter = new FixedWindowRateLimiter(1, 60_000, now)
    expect(limiter.consume('u1').allowed).toBe(true)
    expect(limiter.consume('u2').allowed).toBe(true)
    expect(limiter.consume('u1').allowed).toBe(false)
  })

  it('never reports a zero retry-after when refusing', () => {
    const limiter = new FixedWindowRateLimiter(1, 60_000, now)
    limiter.consume('u1')
    clock += 59_900
    expect(limiter.consume('u1')).toEqual({ allowed: false, retryAfterSeconds: 1 })
  })
})
