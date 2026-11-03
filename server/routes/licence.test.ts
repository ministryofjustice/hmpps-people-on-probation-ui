import type { Express } from 'express'
import request from 'supertest'
import { appWithAllRoutes, createAppSessionCookie } from './testutils/appSetup'
import type { Services } from '../services'
import type { LicenceResponse, SentenceResponse } from '../data/peopleOnProbationApiClient'
import config from '../config'

let app: Express
let peopleOnProbationService: {
  getSentences: jest.Mock
  getDocuments: jest.Mock
  getLicences: jest.Mock
  getLicence: jest.Mock
  getFutureAppointments: jest.Mock
  getLicenceConditionImage: jest.Mock
}

const licenceCondition = { mainCategory: { code: 'NLC8', description: 'Standard licence conditions' } }

const licenceSentence = (overrides: Partial<SentenceResponse> = {}): SentenceResponse => ({
  type: 'ORA Adult Custody (not PSS)',
  typeCode: '327',
  startDate: '2022-01-15',
  expectedEndDate: '2027-03-14',
  requirements: [],
  licenceConditions: [licenceCondition],
  ...overrides,
})

beforeEach(() => {
  config.features.licence = true
  peopleOnProbationService = {
    getSentences: jest.fn(),
    getDocuments: jest.fn(),
    getLicences: jest.fn(),
    getLicence: jest.fn(),
    getFutureAppointments: jest.fn(),
    getLicenceConditionImage: jest.fn(),
  }
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

    expect(response.text).toContain('Your sentence and licence – Check your probation account – GOV.UK')
    expect(response.text).toContain('<h1 class="govuk-heading-xl">Your sentence and licence</h1>')
    expect(response.text).toContain(
      'Make sure you follow the licence conditions. If you do not, conditions could be added or made stricter. In some cases, you could go back to prison.',
    )
    expect(response.text).toContain('href="/probation-agreement"')
    expect(response.text).toContain('Your sentence')
    expect(response.text).not.toContain('Time in prison completed')
    expect(response.text).toContain('You are on licence')
    expect(response.text).toContain('Until 14 March 2027')
    expect(response.text).toContain('Adult Custody')
    expect(response.text).not.toContain('ORA Adult Custody')
    expect(response.text).toContain('What this means')
    expect(response.text).toContain('This is called being on licence.')
    expect(response.text).toContain('Sentence start date')
    expect(response.text).toContain('Sentence end date')
    expect(response.text).toContain('15 January 2022')
    expect(response.text).toContain('Total sentence length')
    expect(response.text).toContain('5 years, 2 months')
    expect(peopleOnProbationService.getSentences).toHaveBeenCalledWith('X123456')
  })

  describe('electronic monitoring tags', () => {
    const tagLicence = (additional: { code: string; text?: string }[]): LicenceResponse => ({
      id: 7,
      conditions: {
        AP: {
          standard: [],
          additional: additional.map(condition => ({
            ...condition,
            category: 'Electronic monitoring',
            restrictions: [] as string[],
          })),
          bespoke: [],
        },
      },
    })

    const renderLicence = async (additional: { code: string; text?: string }[]) => {
      peopleOnProbationService.getSentences.mockResolvedValue({ sentences: [licenceSentence()] })
      peopleOnProbationService.getLicences.mockResolvedValue([{ id: 7, updatedDateTime: '2026-05-14T12:29:00' }])
      peopleOnProbationService.getLicence.mockResolvedValue(tagLicence(additional))

      return request(app)
        .get('/licence')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)
    }

    it.each([
      ['524f2fd6-ad53-47dd-8edc-2161d3dd2ed4', 'You need to wear a GPS tag'],
      ['86e6f2a9-bb60-40f8-9ac4-310ebc72ac2f', 'You need to wear a curfew or radio frequency (RF) tag'],
      ['d36a3b77-30ba-40ce-8953-83e761d3b487', 'You need to wear an alcohol tag'],
    ])('shows the tag for CVL condition %s with the end date from its text', async (code, text) => {
      const response = await renderLicence([{ code, text: 'Monitored until Friday 19 March 2027.' }])

      expect(response.text).toContain(text)
      expect(response.text).toContain('Until 19 March 2027')
      expect(response.text).toContain('<img src="/assets/images/licence-tag.svg" alt=""')
    })

    it('shows one tag per tag condition group', async () => {
      const response = await renderLicence([
        { code: 'fd129172-bdd3-4d97-a4a0-efd7b47a49d4', text: 'Agree to a tag until 1 December 2026.' },
        { code: '524f2fd6-ad53-47dd-8edc-2161d3dd2ed4', text: 'GPS ending on 19 March 2027.' },
        { code: 'd36a3b77-30ba-40ce-8953-83e761d3b487', text: 'No alcohol.' },
      ])

      expect(response.text).toContain('You need to wear a GPS tag')
      expect(response.text).toContain('Until 19 March 2027')
      expect(response.text).toContain('You need to wear an alcohol tag')
      expect(response.text).toContain('Until 1 December 2026')
      expect(response.text.match(/licence-tag\.svg/g)).toHaveLength(2)
    })

    it('omits the "Until" line for a tag with no end date', async () => {
      const response = await renderLicence([{ code: '524f2fd6-ad53-47dd-8edc-2161d3dd2ed4', text: 'GPS monitoring.' }])

      expect(response.text).toContain('You need to wear a GPS tag')
      expect(response.text).toMatch(/pop-licence-progress__item--tag pop-licence-progress__item--centred/)
    })

    it('shows no tag when the licence has no tag conditions', async () => {
      const response = await renderLicence([{ code: '0a370862-5426-49c1-b6d4-3d074d78a81a', text: 'Curfew.' }])

      expect(response.text).not.toContain('You need to wear')
      expect(response.text).not.toContain('licence-tag.svg')
    })

    it('still shows the licence page, without tags, when the licence cannot be loaded', async () => {
      peopleOnProbationService.getSentences.mockResolvedValue({ sentences: [licenceSentence()] })
      peopleOnProbationService.getLicences.mockRejectedValue(new Error('API down'))

      const response = await request(app)
        .get('/licence')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(response.text).toContain('You are on licence')
      expect(response.text).not.toContain('You need to wear')
    })
  })

  describe('sentence type explanation', () => {
    const renderLicence = async (typeCode?: string) => {
      peopleOnProbationService.getSentences.mockResolvedValue({ sentences: [licenceSentence({ typeCode })] })
      return request(app)
        .get('/licence')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)
    }

    it.each([
      ['327', 'You must follow your licence conditions until your licence ends.'],
      ['324', 'The court also added some additional time you need to serve on licence.'],
      ['308', 'You have been released from prison into the community.'],
      ['245', 'Your sentence includes some additional time you need to serve on licence'],
    ])('shows the explanation for disposal code %s', async (typeCode, expectedText) => {
      const response = await renderLicence(typeCode)

      expect(response.text).toContain('data-tracking-id="licence_sentence_type_what_does_this_mean"')
      expect(response.text).toContain(expectedText)
    })

    it.each([
      ['327', true],
      ['324', true],
      ['245', true],
      ['308', false],
    ])('mentions Final Third for disposal code %s: %s', async (typeCode, mentionsFinalThird) => {
      const response = await renderLicence(typeCode)

      expect(response.text.includes('Final Third')).toBe(mentionsFinalThird)
    })

    it.each([
      ['an uncategorised disposal code', '406'],
      ['OU22, which covers both determinate and indeterminate detention', 'OU22'],
      ['a category without an explanation', '340'],
      ['no disposal code', undefined],
    ])('shows the sentence type without an explanation for %s', async (_, typeCode) => {
      const response = await renderLicence(typeCode)

      expect(response.text).toContain('Sentence type')
      expect(response.text).not.toContain('licence_sentence_type_what_does_this_mean')
    })
  })

  it('links both licence conditions cards to their pages', async () => {
    peopleOnProbationService.getSentences.mockResolvedValue({ sentences: [licenceSentence()] })

    const response = await request(app)
      .get('/licence')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toMatch(
      /<a href="\/licence\/specific-conditions" class="pop-card"[^>]*>\s*<h3[^>]*>Additional and bespoke licence conditions<\/h3>/,
    )
    expect(response.text).toContain('These licence conditions are specific to you and can change')
    expect(response.text).toMatch(
      /<a href="\/licence\/standard-conditions" class="pop-card"[^>]*>\s*<h3[^>]*>Standard licence conditions<\/h3>/,
    )
    expect(response.text).toContain('Everyone on licence must follow these conditions')
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
    expect(response.text).not.toContain('Sentence start date')
    expect(response.text).not.toContain('Sentence end date')
    expect(response.text).not.toContain('Total sentence length')
    expect(response.text).not.toContain('Time until your licence ends')
    expect(response.text).not.toContain('role="progressbar"')
  })

  it('shows the time until the licence ends as a percentage of the licence', async () => {
    jest.useFakeTimers({ now: new Date('2026-07-01T12:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] })
    try {
      peopleOnProbationService.getSentences.mockResolvedValue({
        sentences: [licenceSentence({ startDate: '2026-01-01', expectedEndDate: '2026-12-31' })],
      })

      const response = await request(app)
        .get('/licence')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(response.text).toContain('Time until your licence ends')
      expect(response.text).toContain('Remaining: 6 months')
      expect(response.text).toContain('role="progressbar"')
      expect(response.text).toContain('aria-valuenow="50"')
      expect(response.text).toContain('pop-progress__bar-area--bar-only')
      // Heading, then the bar, then the time remaining - the same order as order progress.
      expect(response.text.indexOf('Time until your licence ends')).toBeLessThan(
        response.text.indexOf('role="progressbar"'),
      )
      expect(response.text.indexOf('role="progressbar"')).toBeLessThan(response.text.indexOf('Remaining: 6 months'))
    } finally {
      jest.useRealTimers()
    }
  })

  it('omits the time until the licence ends when the start date is not populated', async () => {
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [licenceSentence({ startDate: undefined })],
    })

    const response = await request(app)
      .get('/licence')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('Until 14 March 2027')
    expect(response.text).not.toContain('Time until your licence ends')
    expect(response.text).not.toContain('role="progressbar"')
  })

  it('shows the licence page for a custodial sentence with a book number, before licence conditions are recorded', async () => {
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [licenceSentence({ bookNumber: '76148A', licenceConditions: [] })],
    })

    const response = await request(app)
      .get('/licence')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('<h1 class="govuk-heading-xl">Your sentence and licence</h1>')
    expect(response.text).toContain('You must follow your licence conditions until your licence ends.')
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

      expect(response.text).toContain('<h3 class="govuk-heading-s govuk-!-margin-bottom-2">Your licence document</h3>')
      expect(response.text).toContain('href="/documents/licence-1"')
      expect(response.text.indexOf('Standard licence conditions</h3>')).toBeLessThan(
        response.text.indexOf('Your licence document</h3>'),
      )
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

describe('GET /licence/standard-conditions', () => {
  const standard = (code: string, text = `CVL wording for ${code}`) => ({ code, text })
  const licence = (standardConditions: { code: string; text: string }[]): LicenceResponse => ({
    id: 7,
    updatedDateTime: '2026-05-14T10:00:00',
    conditions: { AP: { standard: standardConditions, additional: [], bespoke: [] } },
  })

  const renderPage = async () =>
    request(app)
      .get('/licence/standard-conditions')
      .set('Cookie', await createAppSessionCookie('X123456'))

  beforeEach(() => {
    peopleOnProbationService.getSentences.mockResolvedValue({ sentences: [licenceSentence()] })
    peopleOnProbationService.getLicences.mockResolvedValue([{ id: 7, updatedDateTime: '2026-05-14T10:00:00' }])
  })

  it("shows CVL's wording, in CVL's order, with the page content", async () => {
    peopleOnProbationService.getLicence.mockResolvedValue(
      licence([
        standard('9ce9d594-e346-4785-9642-c87e764bee37', 'Behave well and do not commit any crime.'),
        standard('7d416906-0e94-4fde-ae86-8339d339ccb7', 'Get permission if you want to leave the United Kingdom.'),
        standard(
          '6fa6e492-f0ab-4e76-b868-63813db44696',
          'Inform your supervising officer if your contact details change.',
        ),
      ]),
    )

    const response = await renderPage()

    expect(response.status).toBe(200)
    expect(response.text).toContain('Standard licence conditions – Check your probation account – GOV.UK')
    expect(response.text).toContain('<h1 class="govuk-heading-xl">Standard licence conditions</h1>')
    expect(response.text).toContain('href="/licence"')
    expect(response.text).toContain('Last updated on Thursday 14 May 2026')
    expect(response.text).toContain('These are conditions that everyone on licence must follow.')
    expect(response.text).toContain('href="/licence/specific-conditions"')
    expect(response.text).toContain('You need to:')
    expect(response.text).toContain('Using firearms and ammunition')
    expect(peopleOnProbationService.getLicence).toHaveBeenCalledWith('X123456', 7)

    const items = [
      ...response.text.matchAll(
        /<li class="pop-condition-list__item"><span class="pop-condition-list__number">(\d+)\.<\/span><span>([^<]*)<\/span><\/li>/g,
      ),
    ].map(m => `${m[1]}. ${m[2]}`)
    expect(items).toEqual([
      '1. Behave well and do not commit any crime.',
      '2. Get permission if you want to leave the United Kingdom.',
      '3. Inform your supervising officer if your contact details change.',
    ])
  })

  it('uses the most recently updated licence when there is more than one', async () => {
    peopleOnProbationService.getLicences.mockResolvedValue([
      { id: 1, updatedDateTime: '2026-01-01T10:00:00' },
      { id: 2, updatedDateTime: '2026-03-01T10:00:00' },
    ])
    peopleOnProbationService.getLicence.mockResolvedValue(licence([]))

    await renderPage()

    expect(peopleOnProbationService.getLicence).toHaveBeenCalledWith('X123456', 2)
  })

  it('says the conditions are not available when there is no licence yet', async () => {
    peopleOnProbationService.getLicences.mockResolvedValue([])

    const response = await renderPage()

    expect(response.status).toBe(200)
    expect(response.text).toContain('Your standard licence conditions are not available yet.')
    expect(response.text).toContain('data-tracking-id="standard_conditions_unavailable_probation_officer_link"')
    expect(response.text).not.toContain('You need to:')
    expect(response.text).not.toContain('Last updated on')
    expect(peopleOnProbationService.getLicence).not.toHaveBeenCalled()
  })

  it('treats a 404 from the licences API as no licence yet', async () => {
    peopleOnProbationService.getLicences.mockRejectedValue({ responseStatus: 404 })

    const response = await renderPage()

    expect(response.status).toBe(200)
    expect(response.text).toContain('Your standard licence conditions are not available yet.')
    expect(response.text).toContain('data-tracking-id="standard_conditions_unavailable_probation_officer_link"')
  })

  it.each([
    ['longer than 3 months', '2026-01-01', '2026-04-02', true],
    ['exactly 3 months', '2026-01-01', '2026-04-01', false],
    ['shorter than 3 months', '2026-01-01', '2026-02-15', false],
    ['without an end date', '2026-01-01', undefined, false],
  ])('shows the firearms section only for a sentence %s', async (_, startDate, expectedEndDate, shown) => {
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [licenceSentence({ startDate, expectedEndDate })],
    })
    peopleOnProbationService.getLicence.mockResolvedValue(licence([]))

    const response = await renderPage()

    expect(response.text.includes('Using firearms and ammunition')).toBe(shown)
  })

  it('redirects community orders to the requirements page', async () => {
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [
        licenceSentence({
          licenceConditions: [],
          requirements: [{ mainCategory: { code: 'W', description: 'Unpaid Work' } }],
        }),
      ],
    })

    const response = await renderPage()

    expect(response.status).toBe(302)
    expect(response.headers.location).toBe('/requirements')
  })
})

describe('GET /licence/specific-conditions', () => {
  const licence = (
    additional: { code: string; category?: string }[],
    bespoke: { text: string }[] = [],
  ): LicenceResponse => ({
    id: 7,
    updatedDateTime: '2026-05-14T12:29:00',
    conditions: {
      AP: {
        standard: [],
        additional: additional.map(condition => ({ ...condition, restrictions: [] as string[] })),
        bespoke,
      },
    },
  })

  const renderPage = async () =>
    request(app)
      .get('/licence/specific-conditions')
      .set('Cookie', await createAppSessionCookie('X123456'))

  const cardTitles = (html: string) =>
    [...html.matchAll(/<h2 class="govuk-heading-m pop-card__title govuk-!-margin-bottom-0">([^<]*)<\/h2>/g)].map(
      m => m[1],
    )

  beforeEach(() => {
    peopleOnProbationService.getSentences.mockResolvedValue({ sentences: [licenceSentence()] })
    peopleOnProbationService.getLicences.mockResolvedValue([{ id: 7, updatedDateTime: '2026-05-14T12:29:00' }])
  })

  it('shows the page content and one card per group, in response order, each linking to its page', async () => {
    peopleOnProbationService.getLicence.mockResolvedValue(
      licence([
        { code: '524f2fd6-ad53-47dd-8edc-2161d3dd2ed4' },
        { code: '0a370862-5426-49c1-b6d4-3d074d78a81a' },
        { code: '005d70e4-a247-4f82-b8b3-6d294a0f5051' },
      ]),
    )

    const response = await renderPage()

    expect(response.status).toBe(200)
    expect(response.text).toContain('Licence conditions specific to you – Check your probation account – GOV.UK')
    expect(response.text).toContain('<h1 class="govuk-heading-xl">Licence conditions specific to you</h1>')
    expect(response.text).toContain('Last updated on Thursday 14 May 2026, 12:29pm')
    expect(response.text).toContain('These conditions can be added, removed or changed.')
    expect(response.text).toContain('href="/licence/standard-conditions"')
    expect(response.text).toContain('href="/licence"')
    expect(cardTitles(response.text)).toEqual(['Wear a GPS tag', 'Follow a curfew', 'Areas you must not leave'])
    expect(response.text).toContain('href="/licence/specific-conditions/wear-a-gps-tag"')
    expect(response.text).toContain('href="/licence/specific-conditions/follow-a-curfew"')
  })

  it('shows the bespoke conditions card only when there are bespoke conditions', async () => {
    peopleOnProbationService.getLicence.mockResolvedValueOnce(
      licence([{ code: '0a370862-5426-49c1-b6d4-3d074d78a81a' }], [{ text: 'Do not visit the park' }]),
    )
    const withBespoke = await renderPage()
    peopleOnProbationService.getLicence.mockResolvedValueOnce(
      licence([{ code: '0a370862-5426-49c1-b6d4-3d074d78a81a' }]),
    )
    const withoutBespoke = await renderPage()

    expect(cardTitles(withBespoke.text)).toEqual(['Follow a curfew', 'Bespoke licence conditions'])
    expect(withBespoke.text).toContain('href="/licence/specific-conditions/bespoke-licence-conditions"')
    expect(cardTitles(withoutBespoke.text)).toEqual(['Follow a curfew'])
  })

  it('hides the bespoke conditions card when the bespoke conditions are empty', async () => {
    peopleOnProbationService.getLicence.mockResolvedValue(
      licence([{ code: '0a370862-5426-49c1-b6d4-3d074d78a81a' }], [{ text: '' }, { text: '  ' }]),
    )

    const response = await renderPage()

    expect(cardTitles(response.text)).toEqual(['Follow a curfew'])
    expect(response.text).not.toContain('bespoke-licence-conditions')
  })

  it('says there are none when the only bespoke conditions are empty', async () => {
    peopleOnProbationService.getLicence.mockResolvedValue(licence([], [{ text: '' }]))

    const response = await renderPage()

    expect(response.text).toContain('You do not have any licence conditions specific to you.')
  })

  it('still shows an unknown condition under its CVL category', async () => {
    peopleOnProbationService.getLicence.mockResolvedValue(
      licence([{ code: 'new-code', category: 'Residence at a specific place' }]),
    )

    const response = await renderPage()

    expect(cardTitles(response.text)).toEqual(['Residence at a specific place'])
  })

  it('says there are none when the licence has no additional or bespoke conditions', async () => {
    peopleOnProbationService.getLicence.mockResolvedValue(licence([]))

    const response = await renderPage()

    expect(response.text).toContain('You do not have any licence conditions specific to you.')
    expect(response.text).not.toContain('not available yet')
    expect(cardTitles(response.text)).toEqual([])
  })

  it.each([
    ['an empty list', () => peopleOnProbationService.getLicences.mockResolvedValue([])],
    ['a 404', () => peopleOnProbationService.getLicences.mockRejectedValue({ responseStatus: 404 })],
  ])(
    'says the conditions are not available, not that there are none, when the licences API returns %s',
    async (_, mock) => {
      mock()

      const response = await renderPage()

      expect(response.status).toBe(200)
      expect(response.text).toContain('Your licence conditions specific to you are not available yet.')
      expect(response.text).toContain('data-tracking-id="specific_conditions_unavailable_probation_officer_link"')
      expect(response.text).not.toContain('You do not have any licence conditions specific to you.')
      expect(response.text).not.toContain('Last updated on')
      expect(cardTitles(response.text)).toEqual([])
      expect(peopleOnProbationService.getLicence).not.toHaveBeenCalled()
    },
  )

  it('redirects community orders to the requirements page', async () => {
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [
        licenceSentence({
          licenceConditions: [],
          requirements: [{ mainCategory: { code: 'W', description: 'Unpaid Work' } }],
        }),
      ],
    })

    const response = await renderPage()

    expect(response.status).toBe(302)
    expect(response.headers.location).toBe('/requirements')
  })
})

describe('GET /licence/specific-conditions/:groupKey', () => {
  const CURFEW = '0a370862-5426-49c1-b6d4-3d074d78a81a'
  const GPS = '524f2fd6-ad53-47dd-8edc-2161d3dd2ed4'
  const LEAVE = '005d70e4-a247-4f82-b8b3-6d294a0f5051'

  const licence = (additional: { code: string; category?: string; text?: string }[]): LicenceResponse => ({
    id: 7,
    updatedDateTime: '2026-05-14T12:29:00',
    conditions: {
      AP: {
        standard: [],
        additional: additional.map(condition => ({ ...condition, restrictions: [] as string[] })),
        bespoke: [],
      },
    },
  })

  const renderPage = async (groupKey: string) =>
    request(app)
      .get(`/licence/specific-conditions/${groupKey}`)
      .set('Cookie', await createAppSessionCookie('X123456'))

  beforeEach(() => {
    peopleOnProbationService.getSentences.mockResolvedValue({ sentences: [licenceSentence()] })
    peopleOnProbationService.getLicences.mockResolvedValue([{ id: 7, updatedDateTime: '2026-05-14T12:29:00' }])
  })

  it("shows the group's conditions, numbered by their CVL category's place in the response", async () => {
    peopleOnProbationService.getLicence.mockResolvedValue(
      licence([
        { code: LEAVE, category: 'Freedom of movement', text: 'Stay in Leeds' },
        { code: CURFEW, category: 'Curfew arrangement', text: 'Stay at home from 7pm' },
        { code: CURFEW, category: 'Curfew arrangement', text: 'Stay at home at weekends' },
      ]),
    )

    const response = await renderPage('follow-a-curfew')

    expect(response.status).toBe(200)
    expect(response.text).toContain('Follow a curfew – Check your probation account – GOV.UK')
    expect(response.text).toContain('<span class="govuk-caption-l">Your licence conditions</span>')
    expect(response.text).toContain('<h1 class="govuk-heading-xl">Follow a curfew</h1>')
    expect(response.text).toContain('href="/licence/specific-conditions"')
    expect(response.text).toContain(
      '<li class="pop-condition-list__item"><span class="pop-condition-list__number">2.</span><span>(a) Stay at home from 7pm</span></li>',
    )
    expect(response.text).toContain(
      '<li class="pop-condition-list__item"><span class="pop-condition-list__number">2.</span><span>(b) Stay at home at weekends</span></li>',
    )
    expect(response.text).not.toContain('Stay in Leeds')
  })

  it('shows the curfew help, linking to the tag conditions when the person has some', async () => {
    peopleOnProbationService.getLicence.mockResolvedValueOnce(
      licence([{ code: CURFEW }, { code: 'fd129172-bdd3-4d97-a4a0-efd7b47a49d4' }, { code: GPS }]),
    )
    const withTag = await renderPage('follow-a-curfew')
    peopleOnProbationService.getLicence.mockResolvedValueOnce(licence([{ code: CURFEW }]))
    const withoutTag = await renderPage('follow-a-curfew')

    expect(withTag.text).toContain('Help with this licence condition')
    expect(withTag.text).toContain('href="/licence/specific-conditions/wear-a-gps-tag"')
    expect(withoutTag.text).toContain('Help with this licence condition')
    expect(withoutTag.text).toContain('also have to follow your licence conditions for wearing a tag.')
    expect(withoutTag.text).not.toContain('href="/licence/specific-conditions/wear-a-gps-tag"')
  })

  it('shows the electronic monitoring condition and the tag help on a tag page', async () => {
    peopleOnProbationService.getLicence.mockResolvedValue(
      licence([
        { code: 'fd129172-bdd3-4d97-a4a0-efd7b47a49d4', category: 'Electronic monitoring', text: 'Agree to a tag' },
        { code: GPS, category: 'Electronic monitoring', text: 'Wear a GPS tag' },
      ]),
    )

    const response = await renderPage('wear-a-gps-tag')

    expect(response.status).toBe(200)
    expect(response.text).toContain('<h1 class="govuk-heading-xl">Wear a GPS tag</h1>')
    expect(response.text).toContain(
      '<span class="pop-condition-list__number">1.</span><span>(a) Agree to a tag</span></li>',
    )
    expect(response.text).toContain(
      '<span class="pop-condition-list__number">1.</span><span>(b) Wear a GPS tag</span></li>',
    )
    expect(response.text).toContain('Help with this licence condition')
    expect(response.text).toContain('You need to wear this tag all of the time.')
  })

  it('shows the title and help for areas and places you must not go to', async () => {
    peopleOnProbationService.getLicence.mockResolvedValue(
      licence([
        {
          code: '0f9a20f4-35c7-4c77-8af8-f200f153fa11',
          category: 'Freedom of movement',
          text: 'Not to enter the area as defined by the attached map.',
        },
      ]),
    )

    const response = await renderPage('areas-and-places-you-must-not-go-to')

    expect(response.status).toBe(200)
    expect(response.text).toContain('Areas and places you must not go to – Check your probation account – GOV.UK')
    expect(response.text).toContain('<h1 class="govuk-heading-xl">Areas and places you must not go to</h1>')
    expect(response.text).toContain('(a) Not to enter the area as defined by the attached map.')
    expect(response.text).toContain('Help with this licence condition')
    expect(response.text).toContain('Make sure you understand all the places you cannot go to')
  })

  it('shows the help for areas you must not leave', async () => {
    peopleOnProbationService.getLicence.mockResolvedValue(
      licence([{ code: LEAVE, category: 'Freedom of movement', text: 'You must remain within the area.' }]),
    )

    const response = await renderPage('areas-you-must-not-leave')

    expect(response.status).toBe(200)
    expect(response.text).toContain('<h1 class="govuk-heading-xl">Areas you must not leave</h1>')
    expect(response.text).toContain('(a) You must remain within the area.')
    expect(response.text).toContain('Help with this licence condition')
    expect(response.text).toContain('A tag may be used to check that you are not leaving the area.')
  })

  it('shows the help for things you are not allowed to do', async () => {
    peopleOnProbationService.getLicence.mockResolvedValue(
      licence([
        {
          code: '7a9ca3bb-922a-433a-9601-1e475c6c0095',
          category: 'Restriction of conduct or acts',
          text: 'No demonstrations.',
        },
        {
          code: '985d339a-b652-40e3-b0a8-5aafd5e121f1',
          category: 'Restriction of conduct or acts',
          text: 'No gambling.',
        },
      ]),
    )

    const response = await renderPage('things-you-are-not-allowed-to-do')

    expect(response.status).toBe(200)
    expect(response.text).toContain('<h1 class="govuk-heading-xl">Things you are not allowed to do</h1>')
    expect(response.text).toContain('<span>(a) No demonstrations.</span>')
    expect(response.text).toContain('<span>(b) No gambling.</span>')
    expect(response.text).toContain('make sure you check with')
    expect(response.text).toContain('href="/probation-officer"')
  })

  it('shows the help for things you must tell your probation officer about', async () => {
    peopleOnProbationService.getLicence.mockResolvedValue(
      licence([
        {
          code: '2a93b784-b8cb-49ed-95e2-a0df60723cda',
          category: 'Disclosure of information',
          text: 'Vehicle details.',
        },
        { code: 'db2d7e24-b130-4c7e-a1bf-6bb5f3036c02', category: 'Disclosure of information', text: 'Relationships.' },
      ]),
    )

    const response = await renderPage('things-you-must-tell-your-probation-officer-about')

    expect(response.status).toBe(200)
    expect(response.text).toContain(
      '<h1 class="govuk-heading-xl">Things you must tell your probation officer about</h1>',
    )
    expect(response.text).toContain('<span>(a) Vehicle details.</span>')
    expect(response.text).toContain('<span>(b) Relationships.</span>')
    expect(response.text).toContain('will tell you what details to give them and when to do it by.')
    expect(response.text).toContain('they will tell you what they mean by relationship')
  })

  it('shows the title and help for things you are not allowed to use, have or own', async () => {
    peopleOnProbationService.getLicence.mockResolvedValue(
      licence([
        { code: '8e52e16e-1abf-4251-baca-2fabfcb243d0', category: 'Items and documents', text: 'One mobile phone.' },
        { code: '5fa04bbf-6b7c-4b65-9388-a0115cd365a6', category: 'Items and documents', text: 'Surrender passport.' },
        { code: 'bfbc693c-ab65-4042-920e-ddb085bc7aba', category: 'Items and documents', text: 'No internet devices.' },
      ]),
    )

    const response = await renderPage('things-you-are-not-allowed-to-use-have-or-own')

    expect(response.status).toBe(200)
    expect(response.text).toContain('<h1 class="govuk-heading-xl">Things you are not allowed to use, have or own</h1>')
    expect(response.text).toContain('<span>(a) One mobile phone.</span>')
    expect(response.text).toContain('<span>(c) No internet devices.</span>')
    expect(response.text).toContain('<span>(b) Surrender passport.</span>')
    expect(response.text).toContain(
      'asked to use something mentioned in your licence conditions, for example for your job',
    )
  })

  it('shows the title and help for people you must not contact or associate with', async () => {
    peopleOnProbationService.getLicence.mockResolvedValue(
      licence([
        {
          code: '355700a9-6184-40c0-9759-0dfed1994e1e',
          category: 'Contact with a person',
          text: 'Not to contact named people.',
        },
      ]),
    )

    const response = await renderPage('people-you-must-not-contact-or-associate-with')

    expect(response.status).toBe(200)
    expect(response.text).toContain('<h1 class="govuk-heading-xl">People you must not contact or associate with</h1>')
    expect(response.text).toContain('<span>(a) Not to contact named people.</span>')
    expect(response.text).toContain('If you are not allowed to contact a person or people, contact includes:')
    expect(response.text).toContain('If they get in touch with you first, do not reply.')
  })

  it('shows people you must not live with, without help', async () => {
    peopleOnProbationService.getLicence.mockResolvedValue(
      licence([
        {
          code: 'fce34fb2-02f4-4eb0-9b8d-d091e11451fa',
          category: 'Restriction of residency',
          text: 'Not to reside with any child.',
        },
      ]),
    )

    const response = await renderPage('people-you-must-not-live-with')

    expect(response.status).toBe(200)
    expect(response.text).toContain('<h1 class="govuk-heading-xl">People you must not live with</h1>')
    expect(response.text).toContain('<span>(a) Not to reside with any child.</span>')
    expect(response.text).not.toContain('pop-help-panel')
  })

  it('shows the help for the area you must live in', async () => {
    peopleOnProbationService.getLicence.mockResolvedValue(
      licence([
        {
          code: '5db26ab3-9b6f-4bee-b2aa-53aa3f3be7dd',
          category: 'Residence at a specific place',
          text: 'Reside in London.',
        },
      ]),
    )

    const response = await renderPage('area-you-must-live-in')

    expect(response.status).toBe(200)
    expect(response.text).toContain('<h1 class="govuk-heading-xl">Area you must live in</h1>')
    expect(response.text).toContain('<span>(a) Reside in London.</span>')
    expect(response.text).toContain('It is important you stay in the region mentioned in your licence condition')
    expect(response.text).toContain('your licence condition will be updated.')
  })

  it('shows places and people you must report to, without help', async () => {
    peopleOnProbationService.getLicence.mockResolvedValue(
      licence([
        {
          code: '4673ebe4-9fc0-4e48-87c9-eb17d5280867',
          category: 'Supervision in the community',
          text: 'Report to staff.',
        },
      ]),
    )

    const response = await renderPage('places-and-people-you-must-report-to')

    expect(response.status).toBe(200)
    expect(response.text).toContain('<h1 class="govuk-heading-xl">Places and people you must report to</h1>')
    expect(response.text).toContain('<span>(a) Report to staff.</span>')
    expect(response.text).not.toContain('pop-help-panel')
  })

  it.each([
    ['prevent-or-address-extremism', 'Prevent or address extremism', '86f8b3d6-be31-48b2-a29e-5cf662c95ad1'],
    ['take-polygraph-tests', 'Take polygraph tests', '1dc7ee29-df47-48a8-90b6-69e286692d8a'],
    ['agree-to-personal-searches', 'Agree to personal searches', '9678FD9E-F80D-423A-A6FB-B79909094887'],
  ])('shows %s with its conditions, without help', async (groupKey, title, code) => {
    peopleOnProbationService.getLicence.mockResolvedValue(
      licence([{ code, category: 'Category', text: 'A condition.' }]),
    )

    const response = await renderPage(groupKey)

    expect(response.status).toBe(200)
    expect(response.text).toContain(`<h1 class="govuk-heading-xl">${title}</h1>`)
    expect(response.text).toContain('<span>(a) A condition.</span>')
    expect(response.text).not.toContain('pop-help-panel')
  })

  it('shows the help for money and assets you are allowed to have', async () => {
    peopleOnProbationService.getLicence.mockResolvedValue(
      licence([
        { code: 'e8478345-019a-4335-9656-73a77ffd3c42', category: 'Serious organised crime', text: 'Cash limit.' },
        { code: '001328d0-d8bb-48ca-9f99-9c305081d0a2', category: 'Serious organised crime', text: 'Asset details.' },
      ]),
    )

    const response = await renderPage('money-and-assets-you-are-allowed-to-have')

    expect(response.status).toBe(200)
    expect(response.text).toContain('<h1 class="govuk-heading-xl">Money and assets you are allowed to have</h1>')
    expect(response.text).toContain('<span>(a) Cash limit.</span>')
    expect(response.text).toContain('<span>(b) Asset details.</span>')
    expect(response.text).toContain('will tell you about the level of detail you need to give to them')
    expect(response.text).toContain('check with your probation officer.')
  })

  describe('bespoke licence conditions', () => {
    const withBespoke = (bespoke: { text?: string }[]): LicenceResponse => ({
      ...licence([
        { code: CURFEW, category: 'Curfew arrangement' },
        { code: GPS, category: 'Electronic monitoring' },
      ]),
      conditions: {
        AP: {
          standard: [],
          additional: [
            { code: CURFEW, category: 'Curfew arrangement', restrictions: [] },
            { code: GPS, category: 'Electronic monitoring', restrictions: [] },
          ],
          bespoke,
        },
      },
    })

    it('numbers each bespoke condition after the additional condition categories, without a letter', async () => {
      peopleOnProbationService.getLicence.mockResolvedValue(
        withBespoke([{ text: 'Do not attend the O2 Arena.' }, { text: 'Do not visit Leeds.' }]),
      )

      const response = await renderPage('bespoke-licence-conditions')

      expect(response.status).toBe(200)
      expect(response.text).toContain('Bespoke licence conditions – Check your probation account – GOV.UK')
      expect(response.text).toContain('<h1 class="govuk-heading-xl">Bespoke licence conditions</h1>')
      expect(response.text).toContain('<h2 class="govuk-heading-l">Your licence conditions</h2>')
      expect(response.text).toContain(
        '<span class="pop-condition-list__number">3.</span><span>Do not attend the O2 Arena.</span>',
      )
      expect(response.text).toContain(
        '<span class="pop-condition-list__number">4.</span><span>Do not visit Leeds.</span>',
      )
      expect(response.text).not.toContain('pop-help-panel')
    })

    it('says "Your licence conditions" even when there is only one', async () => {
      peopleOnProbationService.getLicence.mockResolvedValue(withBespoke([{ text: 'Do not attend the O2 Arena.' }]))

      const response = await renderPage('bespoke-licence-conditions')

      expect(response.text).toContain('<h2 class="govuk-heading-l">Your licence conditions</h2>')
    })

    it('returns not found when there are no bespoke conditions', async () => {
      peopleOnProbationService.getLicence.mockResolvedValue(withBespoke([]))

      expect((await renderPage('bespoke-licence-conditions')).status).toBe(404)
    })
  })

  describe('maps', () => {
    const EXCLUSION_ZONE = '0f9a20f4-35c7-4c77-8af8-f200f153fa11'
    const mapLicence = (additional: { id: number; code: string; hasImageUpload?: boolean }[]): LicenceResponse => ({
      id: 1440,
      conditions: {
        AP: {
          standard: [],
          additional: additional.map(condition => ({
            ...condition,
            category: 'Freedom of movement',
            text: 'Not to enter the area as defined by the attached map.',
            restrictions: [] as string[],
          })),
          bespoke: [],
        },
      },
    })

    it('shows the map for a condition with an uploaded image, through the image proxy', async () => {
      peopleOnProbationService.getLicence.mockResolvedValue(
        mapLicence([{ id: 204, code: EXCLUSION_ZONE, hasImageUpload: true }]),
      )

      const response = await renderPage('areas-and-places-you-must-not-go-to')

      expect(response.text).toContain('Map of the area you must not enter</h3>')
      expect(response.text).toContain('src="/licence/conditions/1440/204/image"')
      expect(response.text).toContain('alt="Map of the area you must not enter for licence condition 1. (a)"')
    })

    it('links to download the map', async () => {
      peopleOnProbationService.getLicence.mockResolvedValue(
        mapLicence([{ id: 204, code: EXCLUSION_ZONE, hasImageUpload: true }]),
      )

      const response = await renderPage('areas-and-places-you-must-not-go-to')

      expect(response.text).toContain(
        '<a class="govuk-link" href="/licence/conditions/1440/204/image" download="map-licence-condition-1a" data-tracking-id="licence_condition_download_map">Download map<span class="govuk-visually-hidden"> for licence condition 1. (a)</span></a>',
      )
    })

    it('shows each map directly under its own condition', async () => {
      peopleOnProbationService.getLicence.mockResolvedValue(
        mapLicence([
          { id: 204, code: EXCLUSION_ZONE, hasImageUpload: true },
          { id: 205, code: '42f71b40-84cd-446d-8647-f00bbb6c079c' },
          { id: 229, code: EXCLUSION_ZONE, hasImageUpload: true },
        ]),
      )

      const response = await renderPage('areas-and-places-you-must-not-go-to')

      const items = [...response.text.matchAll(/<li class="pop-condition-list__item">([\s\S]*?)<\/li>/g)].map(m => m[1])
      expect(items).toHaveLength(3)
      expect(items[0]).toContain('src="/licence/conditions/1440/204/image"')
      expect(items[1]).not.toContain('Map of')
      expect(items[2]).toContain('src="/licence/conditions/1440/229/image"')
      expect(items[2]).toContain('for licence condition 1. (c)')
    })

    it('shows no map for conditions without an uploaded image', async () => {
      peopleOnProbationService.getLicence.mockResolvedValue(mapLicence([{ id: 204, code: EXCLUSION_ZONE }]))

      const response = await renderPage('areas-and-places-you-must-not-go-to')

      expect(response.text).not.toContain('Map of')
      expect(response.text).not.toContain('/image"')
    })

    it('shows the map on the areas you must not leave page, with its own heading', async () => {
      peopleOnProbationService.getLicence.mockResolvedValue(
        mapLicence([{ id: 211, code: '005d70e4-a247-4f82-b8b3-6d294a0f5051', hasImageUpload: true }]),
      )

      const response = await renderPage('areas-you-must-not-leave')

      expect(response.text).toContain(
        '<h3 class="govuk-heading-s govuk-!-margin-bottom-2">Map of the area you must not leave</h3>',
      )
      expect(response.text).toContain('src="/licence/conditions/1440/211/image"')
      expect(response.text).toContain('alt="Map of the area you must not leave for licence condition 1. (a)"')
      expect(response.text).toContain('Download map')
    })

    it('shows no map on other pages, even when a condition has an image', async () => {
      peopleOnProbationService.getLicence.mockResolvedValue(
        mapLicence([{ id: 203, code: '0a370862-5426-49c1-b6d4-3d074d78a81a', hasImageUpload: true }]),
      )

      const response = await renderPage('follow-a-curfew')

      expect(response.status).toBe(200)
      expect(response.text).not.toContain('Map of')
      expect(response.text).not.toContain('/image"')
    })
  })

  it('has no page for the electronic monitoring condition on its own', async () => {
    peopleOnProbationService.getLicence.mockResolvedValue(
      licence([{ code: 'fd129172-bdd3-4d97-a4a0-efd7b47a49d4', category: 'Electronic monitoring' }]),
    )

    expect((await renderPage('electronic-monitoring')).status).toBe(404)
    expect((await renderPage('wear-a-tag')).status).toBe(404)
  })

  it('shows no help panel for a group without help', async () => {
    peopleOnProbationService.getLicence.mockResolvedValue(
      licence([{ code: '86f8b3d6-be31-48b2-a29e-5cf662c95ad1', text: 'Do not contact extremists' }]),
    )

    const response = await renderPage('prevent-or-address-extremism')

    expect(response.status).toBe(200)
    expect(response.text).not.toContain('pop-help-panel')
    expect(peopleOnProbationService.getFutureAppointments).not.toHaveBeenCalled()
  })

  describe('take drug tests', () => {
    const DRUG_TEST = '322bb3f7-2ee1-46aa-ae1c-3f743efd4327'
    const appointment = (typeCode: string, date: string) => ({
      typeCode,
      date,
      startTime: '10:00',
      endTime: '11:00',
      location: {
        buildingName: 'Probation Office',
        streetName: '123 Main Street',
        town: 'London',
        postcode: 'SE1 2AB',
      },
      practitioner: { name: { forename: 'Robert', surname: 'Smithson' } },
    })

    beforeEach(() => {
      peopleOnProbationService.getLicence.mockResolvedValue(
        licence([{ code: DRUG_TEST, category: 'Drug, alcohol and solvent abuse', text: 'Provide a sample' }]),
      )
    })

    it('shows the next drug test appointment and the help', async () => {
      peopleOnProbationService.getFutureAppointments.mockResolvedValue({
        content: [
          appointment('C084', '2026-10-13'),
          appointment('DRGAPT', '2026-10-20'),
          appointment('DRGAPT', '2026-11-20'),
        ],
      })

      const response = await renderPage('take-drug-tests')

      expect(response.status).toBe(200)
      expect(response.text).toContain('<h1 class="govuk-heading-xl">Take drug tests</h1>')
      expect(response.text).toContain('(a) Provide a sample')
      expect(response.text).toContain('Next drug test')
      expect(response.text).toContain('Tuesday 20 October 2026')
      expect(response.text).not.toContain('13 October 2026')
      expect(response.text).not.toContain('20 November 2026')
      expect(response.text).toContain('<dt class="pop-summary-card__key">Address</dt>')
      expect(response.text).toContain('Probation Office')
      expect(response.text).toContain('Robert Smithson')
      expect(response.text).toContain('View on map')
      expect(response.text).toContain('Add to calendar')
      expect(response.text).toContain('You may be asked to take drug tests even if you have not previously used drugs.')
    })

    it('shows no card when there is no upcoming drug test', async () => {
      peopleOnProbationService.getFutureAppointments.mockResolvedValue({ content: [appointment('C084', '2026-10-13')] })

      const response = await renderPage('take-drug-tests')

      expect(response.status).toBe(200)
      expect(response.text).not.toContain('Next drug test')
      expect(response.text).toContain('Help with this licence condition')
    })

    it('still shows the page when appointments cannot be loaded', async () => {
      peopleOnProbationService.getFutureAppointments.mockRejectedValue(new Error('API down'))

      const response = await renderPage('take-drug-tests')

      expect(response.status).toBe(200)
      expect(response.text).toContain('(a) Provide a sample')
      expect(response.text).not.toContain('Next drug test')
    })
  })

  it('returns not found for a group the person has no conditions in', async () => {
    peopleOnProbationService.getLicence.mockResolvedValue(licence([{ code: CURFEW }]))

    expect((await renderPage('wear-a-gps-tag')).status).toBe(404)
    expect((await renderPage('not-a-group')).status).toBe(404)
  })

  it('redirects community orders to the requirements page', async () => {
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [
        licenceSentence({
          licenceConditions: [],
          requirements: [{ mainCategory: { code: 'W', description: 'Unpaid Work' } }],
        }),
      ],
    })

    const response = await renderPage('follow-a-curfew')

    expect(response.status).toBe(302)
    expect(response.headers.location).toBe('/requirements')
  })
})

describe('GET /licence/conditions/:licenceId/:conditionId/image', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])

  const getImage = async (path: string) =>
    request(app)
      .get(path)
      .set('Cookie', await createAppSessionCookie('X123456'))
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => callback(null, Buffer.concat(chunks)))
      })

  it('serves the image with its content type and safe headers', async () => {
    peopleOnProbationService.getLicenceConditionImage.mockResolvedValue({ body: png, contentType: 'image/png' })

    const response = await getImage('/licence/conditions/1440/204/image')

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toBe('image/png')
    expect(response.headers['content-length']).toBe(String(png.length))
    expect(response.headers['cache-control']).toBe('no-store, private')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['content-disposition']).toBeUndefined()
    expect(response.body).toEqual(png)
  })

  it('serves a JPEG as image/jpeg', async () => {
    peopleOnProbationService.getLicenceConditionImage.mockResolvedValue({ body: jpeg, contentType: 'image/jpeg' })

    const response = await getImage('/licence/conditions/1440/204/image')

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toBe('image/jpeg')
    expect(response.body).toEqual(jpeg)
  })

  it.each(['text/html', 'image/svg+xml', 'application/octet-stream'])(
    'rejects an unexpected content type (%s)',
    async contentType => {
      peopleOnProbationService.getLicenceConditionImage.mockResolvedValue({ body: png, contentType })

      const response = await getImage('/licence/conditions/1440/204/image')

      expect(response.status).toBe(502)
      expect(response.body).not.toEqual(png)
    },
  )

  it('uses the CRN from the session, not the URL', async () => {
    peopleOnProbationService.getLicenceConditionImage.mockResolvedValue({ body: jpeg, contentType: 'image/jpeg' })

    await getImage('/licence/conditions/1440/204/image?crn=Z999999')

    expect(peopleOnProbationService.getLicenceConditionImage).toHaveBeenCalledWith('X123456', 1440, 204)
  })

  it.each([
    '/licence/conditions/0/204/image',
    '/licence/conditions/1440/-1/image',
    '/licence/conditions/abc/204/image',
  ])('returns not found for an invalid id (%s) without calling the API', async path => {
    const response = await getImage(path)

    expect(response.status).toBe(404)
    expect(peopleOnProbationService.getLicenceConditionImage).not.toHaveBeenCalled()
  })

  it.each([404, 400])('returns not found when the API returns %s', async status => {
    peopleOnProbationService.getLicenceConditionImage.mockRejectedValue({ responseStatus: status })

    const response = await getImage('/licence/conditions/1440/204/image')

    expect(response.status).toBe(404)
  })

  it('passes other API errors to the error handler', async () => {
    peopleOnProbationService.getLicenceConditionImage.mockRejectedValue({ responseStatus: 500, message: 'boom' })

    const response = await getImage('/licence/conditions/1440/204/image')

    expect(response.status).toBe(500)
  })

  it('redirects an unauthenticated request to sign in, like the other licence routes', async () => {
    const response = await request(app).get('/licence/conditions/1440/204/image')

    expect(response.status).toBe(302)
    expect(response.headers.location).toBe(`/?returnTo=${encodeURIComponent('/licence/conditions/1440/204/image')}`)
    expect(peopleOnProbationService.getLicenceConditionImage).not.toHaveBeenCalled()
  })
})
