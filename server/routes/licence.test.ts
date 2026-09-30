import type { Express } from 'express'
import request from 'supertest'
import { appWithAllRoutes, createAppSessionCookie } from './testutils/appSetup'
import type { Services } from '../services'
import type { SentenceResponse } from '../data/peopleOnProbationApiClient'
import config from '../config'

let app: Express
let peopleOnProbationService: { getSentences: jest.Mock; getDocuments: jest.Mock }

const licenceCondition = { mainCategory: { code: 'NLC8', description: 'Standard licence conditions' } }

const licenceSentence = (overrides: Partial<SentenceResponse> = {}): SentenceResponse => ({
  type: 'ORA Adult Custody (not PSS)',
  startDate: '2022-01-15',
  expectedEndDate: '2027-03-14',
  requirements: [],
  licenceConditions: [licenceCondition],
  ...overrides,
})

beforeEach(() => {
  config.features.licence = true
  peopleOnProbationService = { getSentences: jest.fn(), getDocuments: jest.fn() }
  app = appWithAllRoutes({
    services: { peopleOnProbationService } as unknown as Partial<Services>,
  })
})

const originalDocumentsFeatureFlag = config.features.documents

afterEach(() => {
  config.features.licence = false
  config.features.documents = originalDocumentsFeatureFlag
  jest.resetAllMocks()
})

describe('GET /licence', () => {
  it('renders the licence page with the sentence summary', async () => {
    peopleOnProbationService.getSentences.mockResolvedValue({ sentences: [licenceSentence()] })

    const response = await request(app)
      .get('/licence')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect('Content-Type', /html/)
      .expect(200)

    expect(response.text).toContain('Your licence – Check your probation account – GOV.UK')
    expect(response.text).toContain('<h1 class="govuk-heading-xl">Your licence</h1>')
    expect(response.text).toContain('which includes your licence conditions')
    expect(response.text).toContain('href="/probation-agreement"')
    expect(response.text).toContain('Your sentence')
    expect(response.text).toContain('Time in prison completed')
    expect(response.text).toContain('Until 14 March 2027')
    expect(response.text).toContain('Adult Custody')
    expect(response.text).not.toContain('ORA Adult Custody')
    expect(response.text).toContain('What does this mean?')
    expect(response.text).toContain('This is called being on licence.')
    expect(response.text).toContain('15 January 2022')
    expect(response.text).toContain('Total sentence length')
    expect(response.text).toContain('5 years, 2 months')
    expect(peopleOnProbationService.getSentences).toHaveBeenCalledWith('X123456')
  })

  it('marks the licence nav item as active', async () => {
    peopleOnProbationService.getSentences.mockResolvedValue({ sentences: [licenceSentence()] })

    const response = await request(app)
      .get('/licence')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toMatch(/govuk-service-navigation__item--active[\s\S]*?href="\/licence"/)
    expect(response.text).not.toContain('href="/requirements"')
  })

  it('omits rows and the "Until" line when the sentence has no dates or type', async () => {
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [licenceSentence({ type: undefined, startDate: undefined, expectedEndDate: undefined })],
    })

    const response = await request(app)
      .get('/licence')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('You are on licence')
    expect(response.text).not.toContain('Until ')
    expect(response.text).not.toContain('Sentence type')
    expect(response.text).not.toContain('Start date')
    expect(response.text).not.toContain('End date')
    expect(response.text).not.toContain('Total sentence length')
  })

  it('redirects community orders to the requirements page', async () => {
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [
        licenceSentence({
          requirements: [{ mainCategory: { code: 'F', description: 'Rehabilitation activity requirement' } }],
          licenceConditions: [],
        }),
      ],
    })

    await request(app)
      .get('/licence')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(302)
      .expect('Location', '/requirements')
  })

  it('redirects to the requirements page when there is no sentence', async () => {
    peopleOnProbationService.getSentences.mockResolvedValue({ sentences: [] })

    await request(app)
      .get('/licence')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(302)
      .expect('Location', '/requirements')
  })

  it('redirects users without a person reference to auth error', async () => {
    await request(app)
      .get('/licence')
      .set('Cookie', await createAppSessionCookie())
      .expect(302)
      .expect('Location', '/autherror')
  })

  it('sends licence users to the error page when the licence feature is off', async () => {
    config.features.licence = false
    peopleOnProbationService.getSentences.mockResolvedValue({ sentences: [licenceSentence()] })

    await request(app)
      .get('/licence')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(302)
      .expect('Location', '/autherror')
  })

  describe('licence document', () => {
    beforeEach(() => {
      config.features.documents = true
      peopleOnProbationService.getSentences.mockResolvedValue({ sentences: [licenceSentence()] })
    })

    it('links to the licence document when one exists', async () => {
      peopleOnProbationService.getDocuments.mockResolvedValue({
        documents: [
          { id: 'court-order-1', name: 'Court order', documentType: 'COURT_ORDER', uploadedAt: '2026-01-01T00:00:00Z' },
          { id: 'licence-1', name: 'Licence', documentType: 'LICENCE_CONDITION', uploadedAt: '2026-01-02T00:00:00Z' },
        ],
      })

      const response = await request(app)
        .get('/licence')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(response.text).toContain('Your licence document')
      expect(response.text).toContain('href="/documents/licence-1"')
      expect(response.text).toContain('View your licence document')
      expect(response.text).not.toContain('href="/documents/court-order-1"')
      expect(peopleOnProbationService.getDocuments).toHaveBeenCalledWith('X123456')
    })

    it('omits the row when there is no licence document', async () => {
      peopleOnProbationService.getDocuments.mockResolvedValue({
        documents: [
          { id: 'court-order-1', name: 'Court order', documentType: 'COURT_ORDER', uploadedAt: '2026-01-01T00:00:00Z' },
        ],
      })

      const response = await request(app)
        .get('/licence')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(response.text).not.toContain('View your licence document')
    })

    it('still renders the page without the row when the documents API fails', async () => {
      peopleOnProbationService.getDocuments.mockRejectedValue(new Error('API down'))

      const response = await request(app)
        .get('/licence')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(response.text).toContain('Your sentence')
      expect(response.text).not.toContain('View your licence document')
    })

    it('does not look up documents when the documents feature is off', async () => {
      config.features.documents = false

      const response = await request(app)
        .get('/licence')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(response.text).not.toContain('View your licence document')
      expect(peopleOnProbationService.getDocuments).not.toHaveBeenCalled()
    })
  })
})
