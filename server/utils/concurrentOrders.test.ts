import type { RequirementResponse, SentenceResponse } from '../data/peopleOnProbationApiClient'
import { combineSentences, groupOrders, mergeRequirements } from './concurrentOrders'

const order = (overrides: Partial<SentenceResponse> = {}): SentenceResponse => ({
  type: 'SA2020 Community Order',
  typeCode: '340',
  startDate: '2026-01-01',
  expectedEndDate: '2027-01-01',
  requirements: [],
  licenceConditions: [],
  ...overrides,
})

const requirement = (
  main: string,
  sub?: string,
  overrides: Partial<RequirementResponse> = {},
): RequirementResponse => ({
  mainCategory: { code: main, description: main },
  ...(sub && { subCategory: { code: sub, description: sub } }),
  ...overrides,
})

const unpaidWork = (overrides: Partial<RequirementResponse> = {}) =>
  requirement('W', 'W01', { required: 120, completed: 40, unit: 'HOURS', ...overrides })

describe('mergeRequirements', () => {
  it('keeps requirements with a different main or sub-category apart, in the order given', () => {
    const requirements = [requirement('W', 'W01'), requirement('W', 'W02'), requirement('F', 'RARREQ')]

    expect(mergeRequirements(requirements)).toEqual(requirements)
  })

  it('adds up the required and completed amounts of the same count-based requirement', () => {
    const merged = mergeRequirements([
      unpaidWork({ required: 120, completed: 40, lastUpdatedAt: '2026-03-01T00:00:00Z' }),
      unpaidWork({ required: 80, completed: 10, lastUpdatedAt: '2026-05-01T00:00:00Z' }),
    ])

    expect(merged).toEqual([unpaidWork({ required: 200, completed: 50, lastUpdatedAt: '2026-05-01T00:00:00Z' })])
  })

  it('caps each completed amount at its required amount before adding them up', () => {
    const [merged] = mergeRequirements([
      unpaidWork({ required: 20, completed: 30 }),
      unpaidWork({ required: 80, completed: 10 }),
    ])

    expect(merged.required).toBe(100)
    expect(merged.completed).toBe(30)
  })

  it('leaves completed out when neither requirement has a completed amount', () => {
    const [merged] = mergeRequirements([unpaidWork({ completed: undefined }), unpaidWork({ completed: undefined })])

    expect(merged.required).toBe(240)
    expect(merged.completed).toBeUndefined()
  })

  it("uses the first date-based requirement's details, with the latest update", () => {
    const curfew = (lastUpdatedAt: string) =>
      requirement('RM49', 'ELEMON', {
        required: 6,
        unit: 'MONTHS',
        expectedStartDate: '2026-01-01',
        expectedEndDate: '2026-07-01',
        lastUpdatedAt,
      })

    expect(mergeRequirements([curfew('2026-02-01T00:00:00Z'), curfew('2026-04-01T00:00:00Z')])).toEqual([
      curfew('2026-04-01T00:00:00Z'),
    ])
  })

  it('keeps requirements with no main category apart', () => {
    const requirements = [{ required: 1 }, { required: 2 }]

    expect(mergeRequirements(requirements)).toEqual(requirements)
  })
})

describe('combineSentences', () => {
  it('returns undefined when there are no sentences', () => {
    expect(combineSentences([])).toBeUndefined()
    expect(combineSentences(undefined)).toBeUndefined()
  })

  it('shows the same requirement once within a single order', () => {
    const combined = combineSentences([
      order({ requirements: [unpaidWork(), unpaidWork(), requirement('F', 'RARREQ')] }),
    ])

    expect(combined.requirements).toEqual([unpaidWork({ required: 240, completed: 80 }), requirement('F', 'RARREQ')])
  })

  it("shows matching orders as the first order, with each order's requirements once, in API order", () => {
    const combined = combineSentences([
      order({ eventNumber: 1, requirements: [unpaidWork(), requirement('F', 'RARREQ')] }),
      order({
        eventNumber: 2,
        requirements: [requirement('RM49', 'ELEMON'), unpaidWork({ required: 80, completed: 10 })],
      }),
    ])

    expect(combined).toEqual(
      order({
        eventNumber: 1,
        requirements: [
          unpaidWork({ required: 200, completed: 50 }),
          requirement('F', 'RARREQ'),
          requirement('RM49', 'ELEMON'),
        ],
      }),
    )
  })

  it('merges the same requirement across orders that do not match too', () => {
    const combined = combineSentences([
      order({ eventNumber: 1, requirements: [unpaidWork()] }),
      order({ eventNumber: 2, typeCode: '341', requirements: [unpaidWork({ required: 80, completed: 10 })] }),
    ])

    expect(combined.eventNumber).toBe(1)
    expect(combined.requirements).toEqual([unpaidWork({ required: 200, completed: 50 })])
  })
})

describe('groupOrders', () => {
  it('returns nothing when there are no sentences', () => {
    expect(groupOrders([])).toEqual([])
    expect(groupOrders(undefined)).toEqual([])
  })

  it('shows matching orders as one, with their requirements merged', () => {
    const orders = groupOrders([
      order({ eventNumber: 1, requirements: [unpaidWork()] }),
      order({
        eventNumber: 2,
        requirements: [unpaidWork({ required: 80, completed: 10 }), requirement('F', 'RARREQ')],
      }),
    ])

    expect(orders).toEqual([
      order({
        eventNumber: 1,
        requirements: [unpaidWork({ required: 200, completed: 50 }), requirement('F', 'RARREQ')],
      }),
    ])
  })

  it.each([
    ['type', { typeCode: '341' }],
    ['start date', { startDate: '2026-02-01' }],
    ['end date', { expectedEndDate: '2027-02-01' }],
  ])('keeps orders with a different %s apart, each with its own requirements', (_, difference) => {
    const orders = groupOrders([
      order({ eventNumber: 1, requirements: [unpaidWork()] }),
      order({ eventNumber: 2, requirements: [requirement('F', 'RARREQ')], ...difference }),
    ])

    expect(orders.map(o => o.eventNumber)).toEqual([1, 2])
    expect(orders[0].requirements).toEqual([unpaidWork()])
    expect(orders[1].requirements).toEqual([requirement('F', 'RARREQ')])
  })

  it.each([['typeCode'], ['startDate'], ['expectedEndDate']] as const)(
    'keeps orders apart when both are missing their %s',
    field => {
      const orders = groupOrders([
        order({ eventNumber: 1, [field]: undefined }),
        order({ eventNumber: 2, [field]: undefined }),
      ])

      expect(orders.map(o => o.eventNumber)).toEqual([1, 2])
    },
  )

  it('shows matching orders once and other orders separately, in API order', () => {
    const orders = groupOrders([
      order({ eventNumber: 1 }),
      order({ eventNumber: 2, typeCode: '341' }),
      order({ eventNumber: 3 }),
    ])

    expect(orders.map(o => o.eventNumber)).toEqual([1, 2])
  })
})
