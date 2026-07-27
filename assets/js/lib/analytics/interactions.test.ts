import { resolveInteractionElementId, isDetailsToggleClick } from './interactions'

// No jsdom in this project's test environment (jest.config.mjs runs
// testEnvironment: 'node'), so these fakes implement just the `closest`
// surface resolveInteractionElementId actually calls, returning whichever
// ancestor (or undefined) each scenario needs. Native closest() traversal
// itself is standard DOM/browser behaviour and isn't what's under test here
// — this exercises the function's own lookup-and-fallback logic.
function fakeElement(closestResults: Partial<Record<string, { dataset?: Record<string, string> }>>): Element {
  return {
    closest: (selector: string) => closestResults[selector] ?? null,
  } as unknown as Element
}

describe('resolveInteractionElementId', () => {
  it('resolves the elementId from the closest data-tracking-id ancestor', () => {
    const target = fakeElement({
      '[data-tracking-id]': { dataset: { trackingId: 'add_to_calendar' } },
    })

    expect(resolveInteractionElementId(target)).toBe('add_to_calendar')
  })

  it('falls back to "chat_icon" when there is no data-tracking-id ancestor but there is a chatbot-button ancestor', () => {
    const target = fakeElement({
      '.chatbot-button': { dataset: {} },
    })

    expect(resolveInteractionElementId(target)).toBe('chat_icon')
  })

  it('prefers a data-tracking-id ancestor over a chatbot-button ancestor when both match', () => {
    const target = fakeElement({
      '[data-tracking-id]': { dataset: { trackingId: 'add_to_calendar' } },
      '.chatbot-button': { dataset: {} },
    })

    expect(resolveInteractionElementId(target)).toBe('add_to_calendar')
  })

  it('returns undefined when neither a data-tracking-id nor a chatbot-button ancestor exists', () => {
    const target = fakeElement({})

    expect(resolveInteractionElementId(target)).toBeUndefined()
  })
})

describe('isDetailsToggleClick', () => {
  // isDetailsToggleClick chains two closest() calls (summary, then details
  // from that summary), so - unlike fakeElement above - the fake returned
  // for 'summary' needs its own closest() method too.
  function fakeChainElement(closestResults: Record<string, Element | null>): Element {
    return {
      closest: (selector: string) => closestResults[selector] ?? null,
    } as unknown as Element
  }

  it('returns true when the click target is inside a <summary> that is inside a <details>', () => {
    const details = fakeChainElement({})
    const summary = fakeChainElement({ details })
    const target = fakeChainElement({ summary })

    expect(isDetailsToggleClick(target)).toBe(true)
  })

  it('returns false when the <summary> ancestor has no <details> ancestor of its own', () => {
    const summary = fakeChainElement({ details: null })
    const target = fakeChainElement({ summary })

    expect(isDetailsToggleClick(target)).toBe(false)
  })

  it('returns false when the click target has no <summary> ancestor at all', () => {
    const target = fakeChainElement({ summary: null })

    expect(isDetailsToggleClick(target)).toBe(false)
  })
})
