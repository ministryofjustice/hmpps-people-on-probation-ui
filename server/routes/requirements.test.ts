import type { Express } from 'express'
import request from 'supertest'
import { appWithAllRoutes, createAppSessionCookie } from './testutils/appSetup'
import type { Services } from '../services'
import type { RequirementResponse, SentenceProgressResponse } from '../data/peopleOnProbationApiClient'
import config from '../config'
import { toRequirementView, toRequirementViews } from './requirements'

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

    it('shows "ORA Adult Custody (not PSS)" unchanged, as only SA2020 is stripped', async () => {
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

      expect(res.text).toContain('ORA Adult Custody (not PSS)')
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

      expect(res.text).toContain('href="/requirements/wear-a-gps-tag"')
      expect(res.text).toContain('pop-requirement-card__title">Wear a GPS tag')
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

      expect(res.text).toContain('href="/requirements/wear-a-gps-tag"')
      expect(res.text).toContain('pop-requirement-card__title">Wear a GPS tag')
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

      expect(res.text).toContain('href="/requirements/follow-a-curfew"')
      expect(res.text).toContain('pop-requirement-card__title">Follow a curfew')
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

      expect(res.text).toContain('href="/requirements/programme-requirement"')
      expect(res.text).toContain('pop-requirement-card__title">Programme requirement')
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
        .get('/requirements/programme-requirement')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('Programme requirement')
      expect(res.text).toContain('>Details</h2>')
      expect(res.text).not.toContain('Progress and details')
      expect(res.text).not.toContain('pop-progress__row')
      expect(res.text).toContain('>Start date<')
      expect(res.text).not.toContain('>End date<')
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

    it('shows the "What this means" explanation for an SA2020 Community Order', async () => {
      fakeDate('2025-01-01')
      const sentence = sentenceWithDates('2024-01-01', '2026-01-01')
      sentence.sentences[0].type = 'SA2020 Community Order'
      sentence.sentences[0].typeCode = '340'
      peopleOnProbationService.getSentences.mockResolvedValue(sentence)

      const res = await request(app)
        .get('/requirements')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('What this means')
      expect(res.text).toContain(
        'Your order is a community order. It lets you stay in the community to serve your sentence instead of going to prison.',
      )
    })

    it('picks the explanation by type code, so other community order types get it too, keeping their label', async () => {
      fakeDate('2025-01-01')
      const sentence = sentenceWithDates('2024-01-01', '2026-01-01')
      sentence.sentences[0].type = 'ORA Community Order'
      sentence.sentences[0].typeCode = '329'
      peopleOnProbationService.getSentences.mockResolvedValue(sentence)

      const res = await request(app)
        .get('/requirements')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('ORA Community Order')
      expect(res.text).toContain('Your order is a community order.')
    })

    it('shows the community order explanation for other community sentences, such as a Youth Rehabilitation Order', async () => {
      fakeDate('2025-01-01')
      const sentence = sentenceWithDates('2024-01-01', '2026-01-01')
      sentence.sentences[0].type = 'SA2020 Youth Rehab Order'
      sentence.sentences[0].typeCode = '342'
      peopleOnProbationService.getSentences.mockResolvedValue(sentence)

      const res = await request(app)
        .get('/requirements')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('Youth Rehab Order')
      expect(res.text).toContain('Your order is a community order.')
    })

    it('shows no explanation without a type code, even if the label matches', async () => {
      fakeDate('2025-01-01')
      const sentence = sentenceWithDates('2024-01-01', '2026-01-01')
      sentence.sentences[0].type = 'SA2020 Community Order'
      peopleOnProbationService.getSentences.mockResolvedValue(sentence)

      const res = await request(app)
        .get('/requirements')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('Community Order')
      expect(res.text).not.toContain('What this means')
    })

    it('shows the "What this means" explanation for an SA2020 Suspended Sentence Order', async () => {
      fakeDate('2025-01-01')
      const sentence = sentenceWithDates('2024-01-01', '2026-01-01')
      sentence.sentences[0].type = 'SA2020 Suspended Sentence Order'
      sentence.sentences[0].typeCode = '341'
      peopleOnProbationService.getSentences.mockResolvedValue(sentence)

      const res = await request(app)
        .get('/requirements')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('What this means')
      expect(res.text).toContain(
        'Your sentence is called a suspended sentence. It is a prison sentence, but the court has decided to give you some rules to follow in the community instead so that you do not go to prison.',
      )
      expect(res.text).toContain('send you to prison')
    })

    it('does not show the "What this means" explanation for an order type without one', async () => {
      fakeDate('2025-01-01')
      peopleOnProbationService.getSentences.mockResolvedValue(sentenceWithDates('2024-01-01', '2026-01-01'))

      const res = await request(app)
        .get('/requirements')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).not.toContain('What this means')
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

      expect(res.text).toContain('Court order</dt>')
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

    it('hides the court order row when the documents feature is off', async () => {
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

      expect(res.text).not.toContain('Court order</dt>')
      expect(res.text).not.toContain('You can find this information in your court order')
      expect(res.text).not.toContain('View your court order')
      expect(peopleOnProbationService.getDocuments).not.toHaveBeenCalled()
    })

    it('hides the court order row, and its card, when there is no document and no overall order card', async () => {
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
      expect(res.text).not.toContain('Court order</dt>')
      expect(res.text).not.toContain('You can find this information in your court order')
      expect(res.text).not.toContain('pop-summary-card--flat')
    })

    it('hides the court order row when the documents API returns no matching document', async () => {
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

      expect(res.text).not.toContain('Court order</dt>')
      expect(res.text).not.toContain('You can find this information in your court order')
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
      .get('/requirements/follow-a-curfew')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(res.text).toContain('>Follow a curfew</h1>')
    expect(res.text).toContain('>Start date<')
    expect(res.text).toContain('>End date<')
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
      .get('/requirements/follow-a-curfew')
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
      .get('/requirements/follow-a-curfew')
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
      .get('/requirements/follow-a-curfew')
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
      .get('/requirements/follow-a-curfew')
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
      .get('/requirements/follow-a-curfew')
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
    expect(res.text).toContain('>Start date<')
    expect(res.text).toContain('>End date<')
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
      .get('/requirements/things-you-are-not-allowed-to-do')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(res.text).toContain('Where to find details')
    expect(res.text).toContain('href="/documents/doc-1">View your court order</a>')
    expect(peopleOnProbationService.getDocuments).toHaveBeenCalledWith('X123456')
  })

  it('shows Time required and the Community Campus help for an unpaid work requirement, without Where to find details', async () => {
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
    expect(res.text).toContain('Help with this requirement')
    expect(res.text).toContain(
      'You can complete up to 30% of your community payback hours online through <a class="govuk-link govuk-link--no-visited-state" href="https://www.communitycampus.online/#/sign-in" target="_blank" rel="noopener noreferrer" data-tracking-id="community_campus_link">Community Campus<span class="govuk-visually-hidden"> (opens in new tab)</span></a>.',
    )
    expect(res.text.match(/You can complete up to 30%/g)).toHaveLength(1)
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

  it('shows the "What this means" Community Payback explanation for an unpaid work requirement', async () => {
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

    expect(res.text).toContain('What this means')
    expect(res.text).toContain(
      '<strong>Community payback (unpaid work)</strong> is sometimes called community service.',
    )
    expect(res.text).toContain('removing graffiti')
  })

  it('shows the "What this means" RAR explanation for a RAR requirement', async () => {
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

    expect(res.text).toContain('What this means')
    expect(res.text).toContain(
      '<strong>Rehabilitation Activity Requirements (RAR)</strong> are activities set by your probation officer. They will talk to you',
    )
    expect(res.text).not.toContain('that you must take part in')
    expect(res.text).toContain('go to meetings with support workers who can help you')
  })

  it('shows the "What this means" GPS tag explanation for a GPS tag requirement', async () => {
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
      .get('/requirements/wear-a-gps-tag')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(res.text).toContain('What this means')
    expect(res.text).toContain('A <strong>GPS tag</strong> tracks your location. It checks that you:')
    expect(res.text).not.toContain('You must keep your tag charged')
  })

  it('shows the "What this means" curfew explanation for a curfew requirement', async () => {
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
      .get('/requirements/follow-a-curfew')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(res.text).toContain('What this means')
    expect(res.text).toContain('A <strong>curfew</strong> means you must stay at a specific address.')
    expect(res.text).toContain('This means you will also have to follow the rules for wearing a tag.')
    expect(res.text).toContain(
      'It is important to remember if you do not follow your curfew you could go back to court.',
    )
  })

  it('shows the "What this means" Prohibited Activity explanation for a prohibited activity requirement', async () => {
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
      .get('/requirements/things-you-are-not-allowed-to-do')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(res.text).toContain('What this means')
    expect(res.text).toContain(
      '<strong>prohibited activity requirement</strong>. It means you must not take part in certain activities.',
    )
    expect(res.text).toContain('<li>carrying a knife</li>')
    expect(res.text).toContain('You may also need to wear a tag.')
  })
})

describe('toRequirementView progress', () => {
  beforeEach(() => {
    fakeDate('2026-07-01T12:00:00Z')
  })

  const mentalHealthTreatment = {
    mainCategory: { code: 'P', description: 'Mental Health Treatment' },
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
      .get('/requirements/address-your-mental-health')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(res.text).toContain('Completed: 6 months (50%)')
    expect(res.text).toMatch(/Time required<\/dt>\s*<dd class="pop-summary-card__value">12 months/)
  })
})

describe('requirement types on the detail page', () => {
  const renderDetail = async (code: string, slug: string) => {
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [{ type: 'ORA Community Order', requirements: [{ mainCategory: { code } }], licenceConditions: [] }],
    })
    return request(app)
      .get(`/requirements/${slug}`)
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)
  }

  it.each([
    ['RM59', 'wear-a-gps-tag', 'gps_tag', 'A <strong>GPS tag</strong> tracks your location.'],
    ['RM49', 'follow-a-curfew', 'curfew', 'A <strong>curfew</strong> means you must stay at a specific address.'],
    [
      'W',
      'community-payback-unpaid-work',
      'unpaid_work',
      '<strong>Community payback (unpaid work)</strong> is sometimes called community service.',
    ],
    [
      'F',
      'rehabilitation-activity-requirement-rar',
      'rar',
      '<strong>Rehabilitation Activity Requirements (RAR)</strong> are activities set by your probation officer.',
    ],
    [
      'R',
      'things-you-are-not-allowed-to-do',
      'prohibited_activity',
      'In your court order, this is called a <strong>prohibited activity requirement</strong>.',
    ],
    [
      'RM38',
      'programme-requirement',
      'programme',
      'A <strong>programme requirement</strong> helps you make positive changes',
    ],
    ['7', 'programme-requirement', 'programme', 'The Building choices programme is one example.'],
  ])('shows the %s explanation with its existing tracking id', async (code, slug, trackingKind, text) => {
    const res = await renderDetail(code, slug)

    expect(res.text).toContain(`data-tracking-id="requirement_detail_${trackingKind}_what_does_this_mean"`)
    expect(res.text).toContain(text)
  })

  it.each([
    [
      'P',
      'address-your-mental-health',
      'Address your mental health',
      'mental_health',
      'In your court order, this is called a <strong>mental health treatment</strong>.',
    ],
    [
      'G',
      'address-drug-use',
      'Address drug use',
      'drug_use',
      'In your court order, this is called <strong>drug rehabilitation</strong>.',
    ],
    [
      'H',
      'address-alcohol-use',
      'Address alcohol use',
      'alcohol_use',
      'In your court order, this is called <strong>alcohol treatment</strong>.',
    ],
    [
      'X',
      'areas-or-places-you-must-not-enter',
      'Areas or places you must not enter',
      'exclusion',
      'In your court order, this is called an <strong>exclusion requirement</strong>.',
    ],
    [
      '3',
      'address-you-must-live-in',
      'Address you must live in',
      'residence',
      'In your court order, this is called a <strong>residence requirement</strong>.',
    ],
  ])('shows %s with its label and explanation', async (code, slug, label, trackingKind, text) => {
    const res = await renderDetail(code, slug)

    expect(res.text).toContain(`>${label}</h1>`)
    expect(res.text).toContain('What this means')
    expect(res.text).toContain(`data-tracking-id="requirement_detail_${trackingKind}_what_does_this_mean"`)
    expect(res.text).toContain(text)
  })

  it.each([
    ['X', 'areas-or-places-you-must-not-enter'],
    ['3', 'address-you-must-live-in'],
  ])('points %s to the court order', async (code, slug) => {
    const res = await renderDetail(code, slug)

    expect(res.text).toContain('Where to find details')
  })

  it.each([
    ['P', 'address-your-mental-health'],
    ['RM38', 'programme-requirement'],
  ])('does not point %s to the court order', async (code, slug) => {
    const res = await renderDetail(code, slug)

    expect(res.text).not.toContain('Where to find details')
  })

  it('shows the alcohol tag with its label, explanation and court order signpost', async () => {
    const res = await renderDetail('T', 'wear-an-alcohol-tag')

    expect(res.text).toContain('>Wear an alcohol tag</h1>')
    expect(res.text).toContain('data-tracking-id="requirement_detail_alcohol_tag_what_does_this_mean"')
    expect(res.text).toContain('An <strong>alcohol monitoring tag</strong> checks your sweat for traces of alcohol.')
    expect(res.text).toContain('Where to find details')
  })
})

describe('curfew link to the rules for wearing a tag', () => {
  const curfew = { mainCategory: { code: 'RM49', description: 'Curfew (Electronic Monitored)' } }
  const gpsTag = { mainCategory: { code: 'RM59', description: 'Location Monitoring(GPS Tagging)' } }
  const alcoholTag = { mainCategory: { code: 'T', description: 'Alcohol Abstinence & Electronic Monitoring (AAMR)' } }

  const renderCurfew = async (requirements: RequirementResponse[]) => {
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [{ type: 'ORA Community Order', requirements, licenceConditions: [] }],
    })
    return request(app)
      .get('/requirements/follow-a-curfew')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)
  }

  it('links to the GPS tag requirement when the person also has one', async () => {
    const res = await renderCurfew([curfew, gpsTag])

    expect(res.text).toContain(
      'This means you will also have to <a class="govuk-link" href="/requirements/wear-a-gps-tag" data-tracking-id="requirement_detail_curfew_tag_rules_link">follow the rules for wearing a tag</a>.',
    )
  })

  it('links to the alcohol tag requirement when that is the only tag', async () => {
    const res = await renderCurfew([curfew, alcoholTag])

    expect(res.text).toContain(
      'href="/requirements/wear-an-alcohol-tag" data-tracking-id="requirement_detail_curfew_tag_rules_link"',
    )
  })

  it('links to the GPS tag first when the person has both tags', async () => {
    const res = await renderCurfew([curfew, alcoholTag, gpsTag])

    expect(res.text).toContain(
      'href="/requirements/wear-a-gps-tag" data-tracking-id="requirement_detail_curfew_tag_rules_link"',
    )
    expect(res.text).not.toContain('href="/requirements/wear-an-alcohol-tag"')
  })

  it('shows the sentence without a link when the person has no tag requirement', async () => {
    const res = await renderCurfew([curfew])

    expect(res.text).toContain('This means you will also have to follow the rules for wearing a tag.')
    expect(res.text).not.toContain('requirement_detail_curfew_tag_rules_link')
  })
})

describe('dates for unpaid work and RAR', () => {
  const renderOne = async (requirement: RequirementResponse, slug: string) => {
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [{ type: 'ORA Community Order', requirements: [requirement], licenceConditions: [] }],
    })
    return request(app)
      .get(`/requirements/${slug}`)
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)
  }

  it('shows the start and end dates for unpaid work, keeping its progress bar and time required', async () => {
    const res = await renderOne(
      {
        mainCategory: { code: 'W', description: 'Unpaid Work' },
        required: 120,
        completed: 40,
        unit: 'HOURS',
        actualStartDate: '2026-01-10',
        expectedEndDate: '2026-12-31',
      },
      'community-payback-unpaid-work',
    )

    expect(res.text).toContain('role="progressbar"')
    expect(res.text).toMatch(/>Start date<\/dt>\s*<dd class="pop-summary-card__value">10 January 2026/)
    expect(res.text).toMatch(/>End date<\/dt>\s*<dd class="pop-summary-card__value">31 December 2026/)
    expect(res.text).toMatch(/>Time required<\/dt>\s*<dd class="pop-summary-card__value">120 hours/)
    expect(res.text).not.toContain('Where to find details')
  })

  it('shows the start and end dates for RAR, keeping days completed and no progress bar', async () => {
    const res = await renderOne(
      {
        mainCategory: { code: 'F', description: 'Rehabilitation Activity Requirement (RAR)' },
        required: 20,
        completed: 9,
        unit: 'DAYS',
        actualStartDate: '2026-02-01',
        expectedEndDate: '2026-11-30',
      },
      'rehabilitation-activity-requirement-rar',
    )

    expect(res.text).not.toContain('role="progressbar"')
    expect(res.text).toMatch(/>Start date<\/dt>\s*<dd class="pop-summary-card__value">1 February 2026/)
    expect(res.text).toMatch(/>End date<\/dt>\s*<dd class="pop-summary-card__value">30 November 2026/)
    expect(res.text).toMatch(/>Days completed<\/dt>\s*<dd class="pop-summary-card__value">9 days/)
    expect(res.text).toMatch(/>Maximum days on order<\/dt>\s*<dd class="pop-summary-card__value">20 days/)
  })

  it('leaves out date rows that are not available', async () => {
    const res = await renderOne(
      {
        mainCategory: { code: 'F', description: 'Rehabilitation Activity Requirement (RAR)' },
        required: 20,
        completed: 9,
        unit: 'DAYS',
      },
      'rehabilitation-activity-requirement-rar',
    )

    expect(res.text).not.toContain('>Start date<')
    expect(res.text).not.toContain('>End date<')
    expect(res.text).toContain('>Days completed<')
  })
})

describe('help with this requirement panel', () => {
  const render = async (code: string, slug: string) => {
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [
        {
          type: 'ORA Community Order',
          requirements: [{ mainCategory: { code, description: code } }],
          licenceConditions: [],
        },
      ],
    })
    return request(app)
      .get(`/requirements/${slug}`)
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)
  }

  it('shows the help panel for a GPS tag, at the bottom of the page', async () => {
    const res = await render('RM59', 'wear-a-gps-tag')

    expect(res.text).toContain('<section class="pop-help-panel" aria-labelledby="help-panel-heading">')
    expect(res.text).toMatch(
      /id="help-panel-heading">\s*<span class="pop-help-panel__icon" aria-hidden="true">i<\/span>\s*Help with this requirement/,
    )
    expect(res.text).toContain('You need to wear this tag all of the time.')
    expect(res.text).toContain('Do not tamper with your tag and tell your probation officer if it stops working.')
    expect(res.text.indexOf('What this means')).toBeLessThan(res.text.indexOf('Help with this requirement'))
    expect(res.text.indexOf('pop-summary-card__details')).toBeLessThan(res.text.indexOf('Help with this requirement'))
    expect(res.text.indexOf('Help with this requirement')).toBeLessThan(res.text.indexOf('govuk-footer'))
  })

  it('shows the help panel for a curfew, linking to the probation officer page', async () => {
    const res = await render('RM49', 'follow-a-curfew')

    expect(res.text).toContain('Help with this requirement')
    expect(res.text).toContain('You must stay at the agreed address at certain times of the day and night.')
    expect(res.text).toContain(
      'You need to ask for permission from <a class="govuk-link" href="/probation-officer" data-tracking-id="requirement_help_curfew_probation_officer_link">your probation officer</a> if you want to stay:',
    )
    expect(res.text).toContain('<li>at a known temporary address</li>')
    expect(res.text).toContain('<li>somewhere new</li>')
  })

  it('shows the help panel for things you are not allowed to do, linking to the probation officer page', async () => {
    const res = await render('R', 'things-you-are-not-allowed-to-do')

    expect(res.text).toContain('Help with this requirement')
    expect(res.text).toContain(
      'If you are not sure if something you want or need to do is covered by this requirement,',
    )
    expect(res.text).toContain(
      'make sure you check with <a class="govuk-link" href="/probation-officer" data-tracking-id="requirement_help_prohibited_activity_probation_officer_link">your probation officer</a> first.',
    )
  })

  it('shows the same tag help for an alcohol tag as for a GPS tag', async () => {
    const res = await render('T', 'wear-an-alcohol-tag')

    expect(res.text).toContain('Help with this requirement')
    expect(res.text).toContain('You need to wear this tag all of the time.')
    expect(res.text).toContain('Do not tamper with your tag and tell your probation officer if it stops working.')
  })

  it('shows the help panel for areas or places you must not enter', async () => {
    const res = await render('X', 'areas-or-places-you-must-not-enter')

    expect(res.text).toContain(
      'If you need to go somewhere within the area in the map or mentioned in the description, ask for permission from <a class="govuk-link" href="/probation-officer" data-tracking-id="requirement_help_exclusion_probation_officer_link">your probation officer</a> first.',
    )
  })

  it('shows the help panel for the address you must live in', async () => {
    const res = await render('3', 'address-you-must-live-in')

    expect(res.text).toContain(
      'You need to ask for permission from <a class="govuk-link" href="/probation-officer" data-tracking-id="requirement_help_residence_probation_officer_link">your probation officer</a> if you want to stay:',
    )
    expect(res.text).toContain('<li>somewhere new</li>')
    expect(res.text).toContain('You need to tell your probation officer if you are at risk of becoming homeless.')
  })

  it('does not show the help panel for a requirement without help', async () => {
    const res = await render('F', 'rehabilitation-activity-requirement-rar')

    expect(res.text).not.toContain('pop-help-panel')
  })
})

describe('administrative RAR requirement from MPOP', () => {
  const adminRar: RequirementResponse = {
    mainCategory: { code: 'RAR', description: 'Rehabilitation Activity Requirement' },
    lastUpdatedAt: '2026-09-30T10:00:00Z',
  }
  const rar: RequirementResponse = {
    mainCategory: { code: 'F', description: 'Rehabilitation Activity Requirement (RAR)' },
    required: 20,
    completed: 9,
    unit: 'DAYS',
    lastUpdatedAt: '2026-08-01T10:00:00Z',
  }

  const mockSentence = (requirements: RequirementResponse[]) =>
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [{ type: 'ORA Community Order', requirements, licenceConditions: [] }],
    })

  it('is left out of the requirement views, keeping the real RAR', () => {
    const views = toRequirementViews([adminRar, rar])

    expect(views).toHaveLength(1)
    expect(views[0].kind).toBe('rar')
  })

  it('is not shown on the requirements page, and does not set the last updated date', async () => {
    mockSentence([adminRar, rar])

    const res = await request(app)
      .get('/requirements')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(res.text.match(/class="pop-requirement-card"/g)).toHaveLength(1)
    expect(res.text).toContain('href="/requirements/rehabilitation-activity-requirement-rar"')
    expect(res.text).not.toContain('30 September 2026')
  })

  it('has no detail page of its own', async () => {
    mockSentence([adminRar])

    await request(app)
      .get('/requirements/rehabilitation-activity-requirement')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(404)
  })
})

describe('progress rules', () => {
  beforeEach(() => {
    fakeDate('2026-07-01T12:00:00Z')
  })

  const alcoholTag = (overrides: Partial<RequirementResponse> = {}): RequirementResponse => ({
    mainCategory: { code: 'T', description: 'Alcohol Abstinence & Electronic Monitoring (AAMR)' },
    required: 120,
    unit: 'DAYS',
    ...overrides,
  })

  it('uses the dates when there is no completed amount, whatever the unit (an ended alcohol tag in days)', () => {
    const view = toRequirementView(
      alcoholTag({
        imposedDate: '2026-02-11',
        expectedStartDate: '2026-02-11',
        expectedEndDate: '2026-06-10',
        actualStartDate: '2026-02-11',
        actualEndDate: '2026-06-10',
      }),
    )

    expect(view.percentComplete).toBe(100)
    expect(view.remainingDuration).toBe('0 days')
    expect(view.remaining).toBeUndefined()
    expect(view.totalLength).toBe('120 days')
  })

  it('counts a completed amount when one is recorded, whatever the type', () => {
    const view = toRequirementView(
      alcoholTag({ completed: 30, actualStartDate: '2026-02-11', expectedEndDate: '2026-06-10' }),
    )

    expect(view.percentComplete).toBe(25)
    expect(view.remaining).toBe(90)
  })

  it('always counts unpaid work and RAR, treating no completed amount as none done', () => {
    const dates = { actualStartDate: '2026-01-01', expectedEndDate: '2026-12-31' }
    const unpaidWork = toRequirementView({
      mainCategory: { code: 'W', description: 'Unpaid Work' },
      required: 40,
      unit: 'HOURS',
      ...dates,
    })
    const rar = toRequirementView({
      mainCategory: { code: 'F', description: 'RAR' },
      required: 20,
      unit: 'DAYS',
      ...dates,
    })

    expect(unpaidWork.percentComplete).toBe(0)
    expect(unpaidWork.remaining).toBe(40)
    expect(rar.percentComplete).toBe(0)
    expect(rar.remaining).toBe(20)
  })

  describe('estimated end from actual start and required length', () => {
    it('estimates progress when there is an actual start but no end date', () => {
      // 60 days from 1 June ends on 30 July; 1 July is day 31 of 60.
      const view = toRequirementView(alcoholTag({ required: 60, actualStartDate: '2026-06-01' }))

      expect(view.percentComplete).toBe(50)
      expect(view.remainingDuration).toBeDefined()
      expect(view.startDate).toBe('1 June 2026')
      expect(view.endDate).toBeUndefined()
      expect(view.totalLength).toBe('60 days')
    })

    it('stops at 99% past the estimated end, with no remaining time, as only nDelius can say it has ended', () => {
      const view = toRequirementView(alcoholTag({ required: 30, actualStartDate: '2026-01-01' }))

      expect(view.percentComplete).toBe(99)
      expect(view.remainingDuration).toBeUndefined()
      expect(view.endDate).toBeUndefined()
    })

    it('works for months', () => {
      const view = toRequirementView({
        mainCategory: { code: 'P', description: 'Mental Health Treatment' },
        required: 12,
        unit: 'MONTHS',
        actualStartDate: '2026-01-01',
      })

      expect(view.percentComplete).toBe(50)
      expect(view.totalLength).toBe('12 months')
    })

    it('is not used with only an expected start date', () => {
      const view = toRequirementView(alcoholTag({ expectedStartDate: '2026-06-01', imposedDate: '2026-05-01' }))

      expect(view.percentComplete).toBeUndefined()
      expect(view.totalLength).toBe('120 days')
    })

    it('is not used for hours, which are not a length of time', () => {
      const view = toRequirementView({
        mainCategory: { code: '7', description: 'Court - Accredited Programme' },
        required: 30,
        unit: 'HOURS',
        actualStartDate: '2026-06-01',
      })

      expect(view.percentComplete).toBeUndefined()
    })
  })

  it('shows a RAR measured by dates in the general progress section, not the days block', async () => {
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [
        {
          type: 'ORA Community Order',
          requirements: [
            {
              mainCategory: { code: 'F', description: 'RAR' },
              actualStartDate: '2026-01-01',
              expectedEndDate: '2026-12-31',
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

    expect(res.text).toContain('role="progressbar"')
    expect(res.text).not.toContain('Days completed')
  })

  it('shows an estimated progress bar without an end date row', async () => {
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [
        {
          type: 'ORA Community Order',
          requirements: [alcoholTag({ required: 60, actualStartDate: '2026-06-01' })],
          licenceConditions: [],
        },
      ],
    })

    const res = await request(app)
      .get('/requirements/wear-an-alcohol-tag')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(res.text).toContain('role="progressbar"')
    expect(res.text).toContain('>Start date<')
    expect(res.text).not.toContain('>End date<')
    expect(res.text).toMatch(/>Time required<\/dt>\s*<dd class="pop-summary-card__value">60 days/)
  })
})
