import { computeScrollDepthPercent } from './scrollDepth'

describe('computeScrollDepthPercent', () => {
  it('returns 100 when the document fits entirely within the viewport (nothing to scroll)', () => {
    const percent = computeScrollDepthPercent({ scrollTop: 0, viewportHeight: 800, documentHeight: 600 })

    expect(percent).toBe(100)
  })

  it('returns 100 when the document height exactly equals the viewport height', () => {
    const percent = computeScrollDepthPercent({ scrollTop: 0, viewportHeight: 800, documentHeight: 800 })

    expect(percent).toBe(100)
  })

  it('reflects the initial viewport at the very top of a page taller than the viewport, not 0', () => {
    // The unscrolled viewport already reveals its own height: 500 / 2500 = 20%.
    const percent = computeScrollDepthPercent({ scrollTop: 0, viewportHeight: 500, documentHeight: 2500 })

    expect(percent).toBe(20)
  })

  it('returns 100 when scrolled all the way to the bottom', () => {
    const percent = computeScrollDepthPercent({ scrollTop: 2000, viewportHeight: 500, documentHeight: 2500 })

    expect(percent).toBe(100)
  })

  it('computes an intermediate percentage rounded to the nearest integer', () => {
    // (1000 + 500) / 2500 = 0.6 -> 60%
    const percent = computeScrollDepthPercent({ scrollTop: 1000, viewportHeight: 500, documentHeight: 2500 })

    expect(percent).toBe(60)
  })

  it('clamps to 100 even if scrollTop + viewportHeight overshoots documentHeight (e.g. elastic overscroll)', () => {
    const percent = computeScrollDepthPercent({ scrollTop: 2100, viewportHeight: 500, documentHeight: 2500 })

    expect(percent).toBe(100)
  })
})
