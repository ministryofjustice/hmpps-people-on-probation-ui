import type { Express } from 'express'
import request from 'supertest'
import { appWithAllRoutes, createAppSessionCookie } from './testutils/appSetup'
import type { Services } from '../services'
import type { RequirementResponse, SentenceProgressResponse } from '../data/peopleOnProbationApiClient'
import config from '../config'
import { toRequirementView } from './requirements'

let app: Express
let peopleOnProbationService: { getSentences: jest.Mock; getDocuments: jest.Mock }

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

const originalDocumentsFeatureFlag = config.features.documents
const originalOffenceDetailsFeatureFlag = config.features.offenceDetails

beforeEach(() => {
  peopleOnProbationService = { getSentences: jest.fn(), getDocuments: jest.fn() }
  app = appWithAllRoutes({
    services: { peopleOnProbationService } as unknown as Partial<Services>,
  })
})

afterEach(() => {
  config.features.licence = false
  config.features.documents = originalDocumentsFeatureFlag
  config.features.offenceDetails = originalOffenceDetailsFeatureFlag
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
  it('redirects licence sentences to the licence page', async () => {
    config.features.licence = true
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [
        {
          requirements: [],
          licenceConditions: [{ mainCategory: { code: 'NLC8', description: 'Standard licence conditions' } }],
        },
      ],
    })

    await request(app)
      .get('/requirements')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(302)
      .expect('Location', '/licence')
  })

  it('does not render offence details by default', async () => {
    fakeDate('2025-01-01')
    config.features.offenceDetails = false
    peopleOnProbationService.getSentences.mockResolvedValue(sentenceWithDates('2024-01-01', '2026-01-01'))

    const res = await request(app)
      .get('/requirements')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(res.text).not.toContain('Offence')
    expect(res.text).not.toContain('Test main offence')
  })

  it('renders the main offence description as the overall order charge when the feature flag is enabled', async () => {
    fakeDate('2025-01-01')
    config.features.offenceDetails = true
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

    it('renders a GPS tag requirement that only has imposedDate (no expectedStartDate/actualStartDate)', async () => {
      fakeDate('2026-09-18')
      peopleOnProbationService.getSentences.mockResolvedValue({
        sentences: [
          {
            type: 'ORA Community Order',
            requirements: [
              {
                mainCategory: { code: 'RM59', description: 'Location Monitoring(GPS Tagging)' },
                subCategory: { code: 'EM3', description: 'Trail Monitoring' },
                imposedDate: '2026-07-02',
                expectedEndDate: '2027-01-02',
                lastUpdatedAt: '2026-07-06T11:52:55+01:00',
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

    describe('requirements sharing a category', () => {
      const unpaidWorkSentence: SentenceProgressResponse = {
        sentences: [
          {
            type: 'SA2020 Suspended Sentence Order',
            requirements: [
              {
                mainCategory: { code: 'W', description: 'Unpaid Work' },
                subCategory: { code: 'W01', description: 'Regular' },
                required: 150,
                completed: 82,
                unit: 'HOURS',
                imposedDate: '2026-06-04',
              },
              {
                mainCategory: { code: 'W', description: 'Unpaid Work' },
                subCategory: { code: 'W03', description: 'Additional Hours' },
                required: 10,
                completed: 5,
                unit: 'HOURS',
                imposedDate: '2026-08-24',
              },
            ],
            licenceConditions: [],
          },
        ],
      }

      it('renders a separate card for each, labelled by sub-category', async () => {
        fakeDate('2026-10-01')
        peopleOnProbationService.getSentences.mockResolvedValue(unpaidWorkSentence)

        const res = await request(app)
          .get('/requirements')
          .set('Cookie', await createAppSessionCookie('X123456'))
          .expect(200)

        expect(res.text).toContain('href="/requirements/community-payback-unpaid-work-regular"')
        expect(res.text).toContain('href="/requirements/community-payback-unpaid-work-additional-hours"')
        expect(res.text).toContain('Community payback (unpaid work) – Regular')
        expect(res.text).toContain('Community payback (unpaid work) – Additional Hours')
      })

      it('renders the detail page of the second requirement', async () => {
        fakeDate('2026-10-01')
        peopleOnProbationService.getSentences.mockResolvedValue(unpaidWorkSentence)

        const res = await request(app)
          .get('/requirements/community-payback-unpaid-work-additional-hours')
          .set('Cookie', await createAppSessionCookie('X123456'))
          .expect(200)

        expect(res.text).toContain('Community payback (unpaid work) – Additional Hours')
        expect(res.text).toContain('10 hours')
        expect(res.text).not.toContain('150 hours')
      })

      it('falls back to a numeric slug suffix when sub-categories are missing', async () => {
        fakeDate('2026-10-01')
        peopleOnProbationService.getSentences.mockResolvedValue({
          sentences: [
            {
              type: 'ORA Community Order',
              requirements: [
                { mainCategory: { code: 'W', description: 'Unpaid Work' }, required: 50, unit: 'HOURS' },
                { mainCategory: { code: 'W', description: 'Unpaid Work' }, required: 20, unit: 'HOURS' },
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
        expect(res.text).toContain('href="/requirements/community-payback-unpaid-work-2"')
      })
    })

    it('renders a card for a requirement with no required count and no end date', async () => {
      fakeDate('2026-06-01')
      peopleOnProbationService.getSentences.mockResolvedValue({
        sentences: [
          {
            type: 'SA2020 Community Order',
            requirements: [
              {
                mainCategory: { code: '7', description: 'Court - Accredited Programme' },
                subCategory: { code: '734', description: 'Building Choices' },
                imposedDate: '2026-03-23',
                expectedStartDate: '2026-03-23',
                actualStartDate: '2026-03-23',
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

      expect(res.text).toContain('href="/requirements/court-accredited-programme"')
      expect(res.text).toContain('pop-requirement-card__title">Court - Accredited Programme')
    })

    it('renders the detail page without a progress bar for a requirement with no required count and no end date', async () => {
      fakeDate('2026-06-01')
      peopleOnProbationService.getSentences.mockResolvedValue({
        sentences: [
          {
            type: 'SA2020 Community Order',
            requirements: [
              {
                mainCategory: { code: '7', description: 'Court - Accredited Programme' },
                imposedDate: '2026-03-23',
                expectedStartDate: '2026-03-23',
                actualStartDate: '2026-03-23',
              },
            ],
            licenceConditions: [],
          },
        ],
      })

      const res = await request(app)
        .get('/requirements/court-accredited-programme')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('Court - Accredited Programme')
      expect(res.text).toContain('>Details</h2>')
      expect(res.text).not.toContain('Progress and details')
      expect(res.text).not.toContain('pop-progress__row')
      expect(res.text).toContain('Start date and time')
      expect(res.text).not.toContain('End date and time')
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

  describe('court order signpost', () => {
    it('shows a "View your court order" link when the documents feature is on and a requirement needs the signpost', async () => {
      config.features.documents = true
      fakeDate('2025-01-01')
      peopleOnProbationService.getSentences.mockResolvedValue({
        sentences: [
          {
            type: 'ORA Community Order',
            startDate: '2024-01-01',
            expectedEndDate: '2026-01-01',
            requirements: [
              {
                mainCategory: { code: 'RM49', description: 'Curfew' },
                expectedStartDate: '2025-01-01',
                expectedEndDate: '2025-12-31',
              },
            ],
            licenceConditions: [],
          },
        ],
      })
      peopleOnProbationService.getDocuments.mockResolvedValue({
        documents: [
          { id: 'doc-1', name: 'Your Court Order', documentType: 'COURT_ORDER', uploadedAt: '2026-01-01T00:00:00Z' },
        ],
      })

      const res = await request(app)
        .get('/requirements')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('Court order')
      expect(res.text).toContain('href="/documents/doc-1">View your court order</a>')
      expect(peopleOnProbationService.getDocuments).toHaveBeenCalledWith('X123456')
    })

    it('does not call getDocuments or show the signpost when no requirement needs it', async () => {
      config.features.documents = true
      fakeDate('2025-01-01')
      peopleOnProbationService.getSentences.mockResolvedValue({
        sentences: [
          {
            type: 'ORA Community Order',
            startDate: '2024-01-01',
            expectedEndDate: '2026-01-01',
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

      expect(res.text).not.toContain('View your court order')
      expect(peopleOnProbationService.getDocuments).not.toHaveBeenCalled()
    })

    it('shows the fallback plain-text signpost, without a link, when the documents feature is off', async () => {
      config.features.documents = false
      fakeDate('2025-01-01')
      peopleOnProbationService.getSentences.mockResolvedValue({
        sentences: [
          {
            type: 'ORA Community Order',
            startDate: '2024-01-01',
            expectedEndDate: '2026-01-01',
            requirements: [
              {
                mainCategory: { code: 'R', description: 'Prohibited Activity' },
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

      expect(res.text).toContain('Court order')
      expect(res.text).toContain('You can find this information in your court order')
      expect(res.text).not.toContain('View your court order')
      expect(peopleOnProbationService.getDocuments).not.toHaveBeenCalled()
    })

    it('shows the fallback plain-text signpost, without a link, when sentence dates are missing so there is no overall order card', async () => {
      config.features.documents = true
      fakeDate('2025-01-01')
      peopleOnProbationService.getSentences.mockResolvedValue({
        sentences: [
          {
            type: 'ORA Community Order',
            requirements: [
              {
                mainCategory: { code: 'RM49', description: 'Curfew' },
                expectedStartDate: '2025-01-01',
                expectedEndDate: '2025-12-31',
              },
            ],
            licenceConditions: [],
          },
        ],
      })
      peopleOnProbationService.getDocuments.mockResolvedValue({ documents: [] })

      const res = await request(app)
        .get('/requirements')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).not.toContain('Overall order')
      expect(res.text).toContain('Court order')
      expect(res.text).toContain('You can find this information in your court order')
    })

    it('shows the fallback plain-text signpost, without a link, when the documents API returns no matching document', async () => {
      config.features.documents = true
      fakeDate('2025-01-01')
      peopleOnProbationService.getSentences.mockResolvedValue({
        sentences: [
          {
            type: 'ORA Community Order',
            startDate: '2024-01-01',
            expectedEndDate: '2026-01-01',
            requirements: [
              {
                mainCategory: { code: 'RM49', description: 'Curfew' },
                expectedStartDate: '2025-01-01',
                expectedEndDate: '2025-12-31',
              },
            ],
            licenceConditions: [],
          },
        ],
      })
      peopleOnProbationService.getDocuments.mockResolvedValue({ documents: [] })

      const res = await request(app)
        .get('/requirements')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('Court order')
      expect(res.text).toContain('You can find this information in your court order')
      expect(res.text).not.toContain('View your court order')
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

  it('links "View your court order" to the document when the documents feature is on and a document exists', async () => {
    config.features.documents = true
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
            },
          ],
          licenceConditions: [],
        },
      ],
    })
    peopleOnProbationService.getDocuments.mockResolvedValue({
      documents: [
        { id: 'doc-1', name: 'Your Court Order', documentType: 'COURT_ORDER', uploadedAt: '2026-01-01T00:00:00Z' },
      ],
    })

    const res = await request(app)
      .get('/requirements/curfew')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(res.text).toContain('href="/documents/doc-1">View your court order</a>')
    expect(peopleOnProbationService.getDocuments).toHaveBeenCalledWith('X123456')
  })

  it('ignores non-court-order documents when picking which document to link to', async () => {
    config.features.documents = true
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
            },
          ],
          licenceConditions: [],
        },
      ],
    })
    peopleOnProbationService.getDocuments.mockResolvedValue({
      documents: [
        { id: 'doc-other', name: 'Something else', documentType: 'OTHER', uploadedAt: '2026-01-01T00:00:00Z' },
        { id: 'doc-1', name: 'Your Court Order', documentType: 'COURT_ORDER', uploadedAt: '2026-01-02T00:00:00Z' },
      ],
    })

    const res = await request(app)
      .get('/requirements/curfew')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(res.text).toContain('href="/documents/doc-1">View your court order</a>')
  })

  it('falls back to plain text, without 500ing the page, when the documents API call fails', async () => {
    config.features.documents = true
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
            },
          ],
          licenceConditions: [],
        },
      ],
    })
    peopleOnProbationService.getDocuments.mockRejectedValue(new Error('API failure'))

    const res = await request(app)
      .get('/requirements/curfew')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(res.text).toContain('You can find this information in your court order')
    expect(res.text).not.toContain('href="/documents/')
  })

  it('falls back to plain text when the documents feature is on but no document exists', async () => {
    config.features.documents = true
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
            },
          ],
          licenceConditions: [],
        },
      ],
    })
    peopleOnProbationService.getDocuments.mockResolvedValue({ documents: [] })

    const res = await request(app)
      .get('/requirements/curfew')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(res.text).toContain('You can find this information in your court order')
    expect(res.text).not.toContain('href="/documents/')
  })

  it('does not call getDocuments when the documents feature is off', async () => {
    config.features.documents = false
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

    expect(res.text).toContain('You can find this information in your court order')
    expect(peopleOnProbationService.getDocuments).not.toHaveBeenCalled()
  })

  it('does not show Where to find details for a date-based requirement that is not a tag type', async () => {
    config.features.documents = true
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
    expect(peopleOnProbationService.getDocuments).not.toHaveBeenCalled()
  })

  it('shows Where to find details for a prohibited activity requirement, linking to the court order', async () => {
    config.features.documents = true
    fakeDate('2025-06-01')
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [
        {
          type: 'ORA Community Order',
          requirements: [
            {
              mainCategory: { code: 'R', description: 'Prohibited Activity' },
              expectedStartDate: '2025-01-01',
              expectedEndDate: '2025-12-31',
            },
          ],
          licenceConditions: [],
        },
      ],
    })
    peopleOnProbationService.getDocuments.mockResolvedValue({
      documents: [
        { id: 'doc-1', name: 'Your Court Order', documentType: 'COURT_ORDER', uploadedAt: '2026-01-01T00:00:00Z' },
      ],
    })

    const res = await request(app)
      .get('/requirements/prohibited-activity')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(res.text).toContain('Where to find details')
    expect(res.text).toContain('href="/documents/doc-1">View your court order</a>')
    expect(peopleOnProbationService.getDocuments).toHaveBeenCalledWith('X123456')
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

  it('shows the "What does this mean?" Prohibited Activity explanation for a prohibited activity requirement', async () => {
    fakeDate('2025-06-01')
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [
        {
          type: 'ORA Community Order',
          requirements: [
            {
              mainCategory: { code: 'R', description: 'Prohibited Activity' },
              expectedStartDate: '2025-01-01',
              expectedEndDate: '2025-12-31',
            },
          ],
          licenceConditions: [],
        },
      ],
    })

    const res = await request(app)
      .get('/requirements/prohibited-activity')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(res.text).toContain('What does this mean?')
    expect(res.text).toContain('A prohibited activity is something the court has said you are not allowed to do.')
    expect(res.text).toContain('If you do something you are not allowed to do, you could be returned to court.')
  })
})

describe('toRequirementView progress', () => {
  beforeEach(() => {
    fakeDate('2026-07-01T12:00:00Z')
  })

  const mentalHealthTreatment = {
    mainCategory: { code: 'RM38', description: 'Mental Health Treatment' },
    required: 12,
    unit: 'MONTHS',
    actualStartDate: '2026-01-01',
    expectedEndDate: '2026-12-31',
  }

  it('uses the dates for a requirement measured in months with no completed amount', () => {
    const view = toRequirementView(mentalHealthTreatment)

    expect(view.percentComplete).toBe(50)
    expect(view.completedDuration).toBe('6 months')
    expect(view.remaining).toBeUndefined()
    expect(view.remainingDuration).toBeDefined()
    expect(view.totalLength).toBe('12 months')
  })

  it('uses the actual end date before the expected one, so a requirement ended early shows as complete', () => {
    const view = toRequirementView({ ...mentalHealthTreatment, actualEndDate: '2026-06-01' })

    expect(view.percentComplete).toBe(100)
    expect(view.endDate).toBe('1 June 2026')
    expect(view.totalLength).toBe('12 months')
  })

  describe('ending today', () => {
    const endsToday: RequirementResponse = {
      ...mentalHealthTreatment,
      actualStartDate: '2026-06-01',
      expectedEndDate: undefined,
    }

    it('shows a requirement whose actual end date is today as complete, with nothing remaining', () => {
      const view = toRequirementView({ ...endsToday, actualEndDate: '2026-07-01' })

      expect(view.percentComplete).toBe(100)
      expect(view.remainingDuration).toBe('0 days')
      expect(view.endDate).toBe('1 July 2026')
    })

    it('leaves an expected end date of today as the last day still to go', () => {
      const view = toRequirementView({ ...endsToday, expectedEndDate: '2026-07-01' })

      expect(view.percentComplete).toBe(97)
      expect(view.remainingDuration).toBe('1 day')
    })

    it('leaves a requirement with an actual end date still to come in progress', () => {
      const view = toRequirementView({ ...endsToday, actualEndDate: '2026-07-31' })

      // 30 of 61 days (1 June to 31 July, inclusive)
      expect(view.percentComplete).toBe(49)
      expect(view.remainingDuration).not.toBe('0 days')
    })
  })

  it('shows no progress for a requirement measured in months with no dates, but keeps the time required', () => {
    const view = toRequirementView({
      ...mentalHealthTreatment,
      actualStartDate: undefined,
      expectedEndDate: undefined,
    })

    expect(view.percentComplete).toBeUndefined()
    expect(view.totalLength).toBe('12 months')
  })

  it('uses the count for a requirement measured in months when a completed amount is recorded', () => {
    const view = toRequirementView({ ...mentalHealthTreatment, completed: 3 })

    expect(view.percentComplete).toBe(25)
    expect(view.completedDuration).toBe('3 months')
    expect(view.remaining).toBe(9)
  })

  it('still counts hours from 0 when no completed amount is recorded, even with dates', () => {
    const view = toRequirementView({
      mainCategory: { code: 'W', description: 'Unpaid Work' },
      required: 40,
      unit: 'HOURS',
      actualStartDate: '2026-01-01',
      expectedEndDate: '2026-12-31',
    })

    expect(view.percentComplete).toBe(0)
    expect(view.completedDuration).toBe('0 hours')
    expect(view.remaining).toBe(40)
    expect(view.totalLength).toBe('40 hours')
  })

  it('renders the date-based progress and time required on the detail page', async () => {
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [{ type: 'ORA Community Order', requirements: [mentalHealthTreatment], licenceConditions: [] }],
    })

    const res = await request(app)
      .get('/requirements/mental-health-treatment')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(res.text).toContain('Completed: 6 months (50%)')
    expect(res.text).toMatch(/Time required<\/dt>\s*<dd class="pop-summary-card__value">12 months/)
  })
})
