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

    expect(res.text).toContain('Offence')
    expect(res.text).toContain('Test main offence')
    expect(res.text).not.toContain('Dummy charge')
  })

  describe('overall order type display', () => {
    it('strips the SA2020 prefix from the order type', async () => {
      fakeDate('2025-01-01')
      peopleOnProbationService.getSentences.mockResolvedValue({
        sentences: [
          {
            type: 'SA2020 Community Order',
            mainOffence: { code: '001', description: 'Test main offence' },
            startDate: '2024-01-01',
            expectedEndDate: '2026-01-01',
            requirements: [],
            licenceConditions: [],
          },
        ],
      })

      const res = await request(app)
        .get('/requirements')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('Community Order')
      expect(res.text).not.toContain('SA2020')
    })

    it('maps "ORA Adult Custody (not PSS)" to Licence', async () => {
      fakeDate('2025-01-01')
      peopleOnProbationService.getSentences.mockResolvedValue({
        sentences: [
          {
            type: 'ORA Adult Custody (not PSS)',
            mainOffence: { code: '001', description: 'Test main offence' },
            startDate: '2024-01-01',
            expectedEndDate: '2026-01-01',
            requirements: [],
            licenceConditions: [],
          },
        ],
      })

      const res = await request(app)
        .get('/requirements')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('Licence')
      expect(res.text).not.toContain('ORA Adult Custody')
    })
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
      expect(res.text).toContain('Completed: 1 year (50%)')
      expect(res.text).not.toContain('Completed: 2 years')
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

  describe('requirement cards', () => {
    it('renders a card linking to /requirements/<slug> for a count-based requirement', async () => {
      fakeDate('2025-06-01')
      peopleOnProbationService.getSentences.mockResolvedValue({
        sentences: [
          {
            type: 'ORA Community Order',
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

      expect(res.text).toContain('class="pop-requirement-card" href="/requirements/unpaid-work"')
      expect(res.text).toContain('pop-requirement-card__title">Unpaid Work')
    })

    it('labels an unpaid work requirement (mainCategory.code = W) as "Community payback (unpaid work)" and links to its slug', async () => {
      fakeDate('2025-06-01')
      peopleOnProbationService.getSentences.mockResolvedValue({
        sentences: [
          {
            type: 'ORA Community Order',
            requirements: [
              {
                mainCategory: { code: 'W', description: 'Unpaid Work' },
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

      expect(res.text).toContain('href="/requirements/community-payback-unpaid-work"')
      expect(res.text).toContain('pop-requirement-card__title">Community payback (unpaid work)')
    })

    it('labels a RAR requirement (mainCategory.code = F) as "Rehabilitation Activity Requirement (RAR)" and links to its slug', async () => {
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

      expect(res.text).toContain('href="/requirements/rehabilitation-activity-requirement-rar"')
      expect(res.text).toContain('pop-requirement-card__title">Rehabilitation Activity Requirement (RAR)')
    })

    it('labels a GPS tag requirement (mainCategory.code = RM59) as "GPS tag" and links to its slug', async () => {
      fakeDate('2025-06-01')
      peopleOnProbationService.getSentences.mockResolvedValue({
        sentences: [
          {
            type: 'ORA Community Order',
            requirements: [
              {
                mainCategory: { code: 'RM59', description: 'Tag' },
                expectedStartDate: '2025-01-01',
                expectedEndDate: '2025-12-31',
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

      expect(res.text).toContain('href="/requirements/gps-tag"')
      expect(res.text).toContain('pop-requirement-card__title">GPS tag')
    })

    it('labels a curfew requirement (mainCategory.code = RM49) as "Curfew" and links to its slug', async () => {
      fakeDate('2025-06-01')
      peopleOnProbationService.getSentences.mockResolvedValue({
        sentences: [
          {
            type: 'ORA Community Order',
            requirements: [
              {
                mainCategory: { code: 'RM49', description: 'Tag' },
                expectedStartDate: '2025-01-01',
                expectedEndDate: '2025-12-31',
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

      expect(res.text).toContain('href="/requirements/curfew"')
      expect(res.text).toContain('pop-requirement-card__title">Curfew')
    })

    it('renders a card for a date-based requirement using its category description as the label', async () => {
      fakeDate('2025-06-01')
      peopleOnProbationService.getSentences.mockResolvedValue({
        sentences: [
          {
            type: 'ORA Community Order',
            requirements: [
              {
                mainCategory: { code: 'SUP', description: 'Supervision' },
                expectedStartDate: '2025-01-01',
                expectedEndDate: '2025-12-31',
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

      expect(res.text).toContain('href="/requirements/supervision"')
      expect(res.text).toContain('pop-requirement-card__title">Supervision')
    })

    it('does not render a card list section when there are no requirements', async () => {
      fakeDate('2025-01-01')
      peopleOnProbationService.getSentences.mockResolvedValue(sentenceWithDates('2024-01-01', '2026-01-01'))

      const res = await request(app)
        .get('/requirements')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).not.toContain('pop-requirement-card')
      expect(res.text).not.toContain('Requirements in your order')
    })
  })

  describe('overall order', () => {
    it('labels the total length row as "Total order length"', async () => {
      fakeDate('2025-01-01')
      peopleOnProbationService.getSentences.mockResolvedValue(sentenceWithDates('2024-01-01', '2026-01-01'))

      const res = await request(app)
        .get('/requirements')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('Total order length')
      expect(res.text).not.toContain('Total length of time')
    })

    it('shows the "What does this mean?" explanation for an SA2020 Community Order', async () => {
      fakeDate('2025-01-01')
      const sentence = sentenceWithDates('2024-01-01', '2026-01-01')
      sentence.sentences[0].type = 'SA2020 Community Order'
      peopleOnProbationService.getSentences.mockResolvedValue(sentence)

      const res = await request(app)
        .get('/requirements')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('What does this mean?')
      expect(res.text).toContain(
        'Your order is a community order. It lets you stay in the community to serve your sentence instead of going to prison.',
      )
    })

    it('matches the SA2020 Community Order type case-insensitively', async () => {
      fakeDate('2025-01-01')
      const sentence = sentenceWithDates('2024-01-01', '2026-01-01')
      sentence.sentences[0].type = 'sa2020 community order'
      peopleOnProbationService.getSentences.mockResolvedValue(sentence)

      const res = await request(app)
        .get('/requirements')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('What does this mean?')
    })

    it('shows the "What does this mean?" explanation for an SA2020 Suspended Sentence Order', async () => {
      fakeDate('2025-01-01')
      const sentence = sentenceWithDates('2024-01-01', '2026-01-01')
      sentence.sentences[0].type = 'SA2020 Suspended Sentence Order'
      peopleOnProbationService.getSentences.mockResolvedValue(sentence)

      const res = await request(app)
        .get('/requirements')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('What does this mean?')
      expect(res.text).toContain(
        'Your sentence is called a suspended sentence. It is a prison sentence, but the court has decided to give you some rules to follow in the community instead so that you do not go to prison.',
      )
      expect(res.text).toContain('send you to prison')
    })

    it('does not show the "What does this mean?" explanation for an order type without one', async () => {
      fakeDate('2025-01-01')
      peopleOnProbationService.getSentences.mockResolvedValue(sentenceWithDates('2024-01-01', '2026-01-01'))

      const res = await request(app)
        .get('/requirements')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).not.toContain('What does this mean?')
    })
  })
})

describe('GET /requirements/:slug', () => {
  it('404s when no requirement matches the slug', async () => {
    fakeDate('2025-06-01')
    peopleOnProbationService.getSentences.mockResolvedValue(sentenceWithDates('2024-01-01', '2026-01-01'))

    await request(app)
      .get('/requirements/does-not-exist')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(404)
  })

  it('shows Start/End date, Time required and Where to find details for a date-based requirement', async () => {
    fakeDate('2025-06-01')
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [
        {
          type: 'ORA Community Order',
          requirements: [
            {
              mainCategory: { code: 'RM49', description: 'Curfew' },
              expectedStartDate: '2025-01-01',
              expectedEndDate: '2025-12-31',
              lastUpdatedAt: '2026-05-14T12:00:00.000Z',
            },
          ],
          licenceConditions: [],
        },
      ],
    })

    const res = await request(app)
      .get('/requirements/curfew')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(res.text).toContain('>Curfew</h1>')
    expect(res.text).toContain('Start date and time')
    expect(res.text).toContain('End date and time')
    expect(res.text).toContain('Where to find details')
    expect(res.text).toContain('You can find this information in your court order')
    expect(res.text).toContain('Your requirements were last updated on')
    expect(res.text).toContain('Thursday 14 May 2026')
  })

  it('does not show Where to find details for a date-based requirement that is not a tag type', async () => {
    fakeDate('2025-06-01')
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [
        {
          type: 'ORA Community Order',
          requirements: [
            {
              mainCategory: { code: 'SUP', description: 'Supervision' },
              expectedStartDate: '2025-01-01',
              expectedEndDate: '2025-12-31',
              lastUpdatedAt: '2026-05-14T12:00:00.000Z',
            },
          ],
          licenceConditions: [],
        },
      ],
    })

    const res = await request(app)
      .get('/requirements/supervision')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(res.text).toContain('>Supervision</h1>')
    expect(res.text).toContain('Start date and time')
    expect(res.text).toContain('End date and time')
    expect(res.text).not.toContain('Where to find details')
  })

  it('shows Time required and the Community Campus note for an unpaid work requirement, without Where to find details', async () => {
    fakeDate('2025-06-01')
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [
        {
          type: 'ORA Community Order',
          requirements: [
            {
              mainCategory: { code: 'W', description: 'Unpaid Work' },
              required: 140,
              completed: 80,
              unit: 'HOURS',
            },
          ],
          licenceConditions: [],
        },
      ],
    })

    const res = await request(app)
      .get('/requirements/community-payback-unpaid-work')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(res.text).toContain('Time required')
    expect(res.text).toContain('140 hours')
    expect(res.text).toContain('Community Campus')
    expect(res.text).not.toContain('Where to find details')
  })

  it('shows Days completed and Maximum days on order, with no progress bar, for a RAR requirement', async () => {
    fakeDate('2025-06-01')
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [
        {
          type: 'ORA Community Order',
          requirements: [
            {
              mainCategory: { code: 'F', description: 'Rehabilitation Activity Requirement (RAR)' },
              required: 90,
              completed: 0,
              unit: 'DAYS',
            },
          ],
          licenceConditions: [],
        },
      ],
    })

    const res = await request(app)
      .get('/requirements/rehabilitation-activity-requirement-rar')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(res.text).toContain('<h2 class="govuk-heading-l pop-requirements__section-heading">Details</h2>')
    expect(res.text).toContain('Days completed')
    expect(res.text).toContain('Maximum days on order')
    expect(res.text).toContain('90 days')
    expect(res.text).not.toContain('pop-progress__row')
  })

  it('pluralises completed and required durations independently of the remaining amount', async () => {
    fakeDate('2025-06-01')
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [
        {
          type: 'ORA Community Order',
          requirements: [
            {
              mainCategory: { code: 'F', description: 'Rehabilitation Activity Requirement (RAR)' },
              required: 90,
              completed: 89,
              unit: 'DAYS',
            },
          ],
          licenceConditions: [],
        },
      ],
    })

    const res = await request(app)
      .get('/requirements/rehabilitation-activity-requirement-rar')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(res.text).toContain('89 days')
    expect(res.text).toContain('90 days')
    expect(res.text).not.toContain('89 day<')
    expect(res.text).not.toContain('90 day<')
  })

  it('shows the "What does this mean?" Community Payback explanation for an unpaid work requirement', async () => {
    fakeDate('2025-06-01')
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [
        {
          type: 'ORA Community Order',
          requirements: [
            {
              mainCategory: { code: 'W', description: 'Unpaid Work' },
              required: 140,
              completed: 80,
              unit: 'HOURS',
            },
          ],
          licenceConditions: [],
        },
      ],
    })

    const res = await request(app)
      .get('/requirements/community-payback-unpaid-work')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(res.text).toContain('What does this mean?')
    expect(res.text).toContain('Community payback (unpaid work) is sometimes called community service.')
    expect(res.text).toContain('removing graffiti')
  })

  it('shows the "What does this mean?" RAR explanation for a RAR requirement', async () => {
    fakeDate('2025-06-01')
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [
        {
          type: 'ORA Community Order',
          requirements: [
            {
              mainCategory: { code: 'F', description: 'Rehabilitation Activity Requirement (RAR)' },
              required: 90,
              completed: 0,
              unit: 'DAYS',
            },
          ],
          licenceConditions: [],
        },
      ],
    })

    const res = await request(app)
      .get('/requirements/rehabilitation-activity-requirement-rar')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(res.text).toContain('What does this mean?')
    expect(res.text).toContain(
      'Rehabilitation Activity Requirements (RAR) are activities set by your probation officer that you must take part in.',
    )
    expect(res.text).toContain('go to meetings with support workers who can help you')
  })

  it('shows the "What does this mean?" GPS tag explanation for a GPS tag requirement', async () => {
    fakeDate('2025-06-01')
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [
        {
          type: 'ORA Community Order',
          requirements: [
            {
              mainCategory: { code: 'RM59', description: 'Tag' },
              expectedStartDate: '2025-01-01',
              expectedEndDate: '2025-12-31',
            },
          ],
          licenceConditions: [],
        },
      ],
    })

    const res = await request(app)
      .get('/requirements/gps-tag')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(res.text).toContain('What does this mean?')
    expect(res.text).toContain('A GPS tag tracks your location. It checks that you:')
    expect(res.text).toContain('You must keep your tag charged and you need to do this for at least 1 hour a day.')
  })

  it('shows the "What does this mean?" curfew explanation for a curfew requirement', async () => {
    fakeDate('2025-06-01')
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [
        {
          type: 'ORA Community Order',
          requirements: [
            {
              mainCategory: { code: 'RM49', description: 'Tag' },
              expectedStartDate: '2025-01-01',
              expectedEndDate: '2025-12-31',
            },
          ],
          licenceConditions: [],
        },
      ],
    })

    const res = await request(app)
      .get('/requirements/curfew')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(res.text).toContain('What does this mean?')
    expect(res.text).toContain('A curfew means you must stay at a specific address agreed with the court.')
    expect(res.text).toContain(
      'It is important to remember if you do not follow your curfew you could go back to court.',
    )
  })
})
