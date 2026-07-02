import type { Express } from 'express'
import request from 'supertest'
import { appWithAllRoutes, createAppSessionCookie } from './testutils/appSetup'
import type { Services } from '../services'
import type { SentenceProgressResponse } from '../data/peopleOnProbationApiClient'

let app: Express
let peopleOnProbationService: { getSentences: jest.Mock }

// Fake only the Date clock; leave async timer primitives real so supertest works
const fakeDate = (dateStr: string) => {
  const opts = {
    now: new Date(dateStr),
    doNotFake: [
      'nextTick',
      'setImmediate',
      'clearImmediate',
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
    ],
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jest.useFakeTimers(opts as any)
}

beforeEach(() => {
  peopleOnProbationService = { getSentences: jest.fn() }
  app = appWithAllRoutes({
    services: { peopleOnProbationService } as unknown as Partial<Services>,
  })
})

afterEach(() => {
  jest.useRealTimers()
  jest.resetAllMocks()
})

const sentenceWithDates = (startDate: string, expectedEndDate: string): SentenceProgressResponse => ({
  sentences: [
    {
      type: 'ORA Community Order',
      mainOffence: {
        code: '001',
        description: 'Test main offence',
      },
      startDate,
      expectedEndDate,
      requirements: [],
      licenceConditions: [],
    },
  ],
})

describe('GET /requirements', () => {
  it('renders the main offence description as the overall order charge', async () => {
    fakeDate('2025-01-01')
    peopleOnProbationService.getSentences.mockResolvedValue(sentenceWithDates('2024-01-01', '2026-01-01'))

    const res = await request(app)
      .get('/requirements')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(res.text).toContain('Charge')
    expect(res.text).toContain('Test main offence')
    expect(res.text).not.toContain('Dummy charge')
  })

  describe('overall order completedDuration clamping', () => {
    it('does not exceed totalLength when today is after the end date', async () => {
      fakeDate('2027-06-01')
      peopleOnProbationService.getSentences.mockResolvedValue(sentenceWithDates('2024-01-01', '2026-01-01'))

      const res = await request(app)
        .get('/requirements')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).not.toContain('3 years')
      expect(res.text).toContain('2 years')
    })

    it('shows partial completedDuration when today is mid-order', async () => {
      fakeDate('2025-01-01')
      peopleOnProbationService.getSentences.mockResolvedValue(sentenceWithDates('2024-01-01', '2026-01-01'))

      const res = await request(app)
        .get('/requirements')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      // 366 completed out of 732 total days = 50%
      expect(res.text).toContain('aria-valuenow="50"')
      expect(res.text).toContain('1 year completed')
      expect(res.text).not.toContain('2 years completed')
    })

    it('shows 100% progress when today is after the end date', async () => {
      fakeDate('2027-06-01')
      peopleOnProbationService.getSentences.mockResolvedValue(sentenceWithDates('2024-01-01', '2026-01-01'))

      const res = await request(app)
        .get('/requirements')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('aria-valuenow="100"')
    })
  })

  describe('requirement completedDuration clamping', () => {
    it('does not exceed totalLength when today is after the requirement end date', async () => {
      fakeDate('2027-06-01')
      // No overall order dates so only the requirement progress bar is rendered
      peopleOnProbationService.getSentences.mockResolvedValue({
        sentences: [
          {
            type: 'ORA Community Order',
            requirements: [
              {
                mainCategory: { code: 'SUP', description: 'Supervision' },
                expectedStartDate: '2024-01-01',
                expectedEndDate: '2026-01-01',
              },
            ],
            licenceConditions: [],
          },
        ],
      })

      const res = await request(app)
        .get('/requirements')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      // Requirement is past end; completedDuration must be clamped — no "3 years" in the page
      expect(res.text).not.toContain('3 years')
      expect(res.text).toContain('aria-valuenow="100"')
    })
  })

  describe('count-based requirements', () => {
    it('renders hours required, completed, and remaining', async () => {
      fakeDate('2025-06-01')
      peopleOnProbationService.getSentences.mockResolvedValue({
        sentences: [
          {
            type: 'ORA Community Order',
            startDate: '2025-01-01',
            expectedEndDate: '2026-01-01',
            requirements: [
              {
                mainCategory: { code: 'UPW', description: 'Unpaid Work' },
                required: 100,
                completed: 40,
                unit: 'HOURS',
              },
            ],
            licenceConditions: [],
          },
        ],
      })

      const res = await request(app)
        .get('/requirements')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('100')
      expect(res.text).toContain('40')
      expect(res.text).toContain('60')
    })
  })

  describe('RAR requirements (mainCategory.code = F)', () => {
    it('shows Maximum days label, hides remaining row and progress bar', async () => {
      fakeDate('2025-06-01')
      peopleOnProbationService.getSentences.mockResolvedValue({
        sentences: [
          {
            type: 'ORA Community Order',
            requirements: [
              {
                mainCategory: { code: 'F', description: 'Rehabilitation Activity Requirement (RAR)' },
                required: 20,
                completed: 8,
                unit: 'DAYS',
              },
            ],
            licenceConditions: [],
          },
        ],
      })

      const res = await request(app)
        .get('/requirements')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('Maximum days on order')
      expect(res.text).toContain('20')
      expect(res.text).toContain('8')
      expect(res.text).not.toContain('Days remaining')
      expect(res.text).not.toContain('pop-progress__row')
    })
  })
})
