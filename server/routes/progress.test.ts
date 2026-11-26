import type { Express } from 'express'
import request from 'supertest'
import { appWithAllRoutes, createAppSessionCookie } from './testutils/appSetup'
import type { Services } from '../services'
import config from '../config'
import type { AppointmentResponse, RequirementResponse, SentenceResponse } from '../data/peopleOnProbationApiClient'
import { countAttendedAppointments, requirementProgress } from './progress'

let app: Express
let peopleOnProbationService: {
  getAllPastAppointments: jest.Mock
  getSentences: jest.Mock
  getSentencePlan: jest.Mock
  getLicences: jest.Mock
  getLicence: jest.Mock
}

const unpaidWork = (overrides: Partial<RequirementResponse> = {}): RequirementResponse => ({
  mainCategory: { code: 'W', description: 'Unpaid Work' },
  required: 100,
  completed: 35,
  unit: 'HOURS',
  ...overrides,
})

const rar = (overrides: Partial<RequirementResponse> = {}): RequirementResponse => ({
  mainCategory: { code: 'F', description: 'Rehabilitation Activity Requirement (RAR)' },
  required: 20,
  completed: 9,
  unit: 'DAYS',
  ...overrides,
})

const attended = (overrides: Partial<AppointmentResponse> = {}): AppointmentResponse => ({
  date: '2026-01-01',
  attended: true,
  ...overrides,
})

const mockData = ({
  appointments = [attended(), attended()],
  requirements = [unpaidWork(), rar()],
  goals = [{ goalStatus: 'ACHIEVED' }, { goalStatus: 'ACTIVE' }],
}: {
  appointments?: AppointmentResponse[]
  requirements?: RequirementResponse[]
  goals?: { goalStatus: string }[]
} = {}) => {
  peopleOnProbationService.getAllPastAppointments.mockResolvedValue(appointments)
  peopleOnProbationService.getSentences.mockResolvedValue({ sentences: [{ requirements, licenceConditions: [] }] })
  peopleOnProbationService.getSentencePlan.mockResolvedValue({ goals })
}

const renderProgress = async () =>
  request(app)
    .get('/progress')
    .set('Cookie', await createAppSessionCookie('X123456'))

beforeEach(() => {
  peopleOnProbationService = {
    getAllPastAppointments: jest.fn(),
    getSentences: jest.fn(),
    getSentencePlan: jest.fn(),
    getLicences: jest.fn().mockResolvedValue([]),
    getLicence: jest.fn(),
  }
  app = appWithAllRoutes({ services: { peopleOnProbationService } as unknown as Partial<Services> })
})

afterEach(() => {
  jest.resetAllMocks()
})

describe('GET /progress', () => {
  it('shows attendance, unpaid work, goals and RAR in the design order', async () => {
    mockData()

    const response = await renderProgress()

    expect(response.status).toBe(200)
    expect(response.text).toContain('Progress and achievements – Check your probation account – GOV.UK')
    expect(response.text).toContain('<h1 class="govuk-heading-xl">Progress and achievements</h1>')

    const rows = [
      'You have attended 2 <a class="govuk-link govuk-link--no-visited-state" href="/appointments?tab=past" data-tracking-id="progress_appointments_link">probation appointments</a>',
      'You have completed 35 hours of <a class="govuk-link govuk-link--no-visited-state" href="/your-probation/community-payback-unpaid-work" data-tracking-id="progress_unpaid_work_link">community payback (unpaid work)</a>',
      'You have achieved 1 <a class="govuk-link govuk-link--no-visited-state" href="/goals?tab=achieved" data-tracking-id="progress_goals_link">goal</a>',
      'You have completed 9 <a class="govuk-link govuk-link--no-visited-state" href="/your-probation/rehabilitation-activity-requirement-rar" data-tracking-id="progress_rar_link">RAR days</a>',
    ]
    const positions = rows.map(row => response.text.indexOf(row))
    positions.forEach(position => expect(position).toBeGreaterThan(-1))
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('shows each row with its icon', async () => {
    mockData()

    const response = await renderProgress()

    expect(response.text).toContain('<img src="/assets/images/progress-calendar.svg" alt="" width="34" height="33">')
    expect(response.text).toContain('<img src="/assets/images/progress-hi-vis-vest.svg" alt="" width="33" height="37">')
    expect(response.text).toContain('<img src="/assets/images/progress-target.svg" alt="" width="36" height="36">')
    expect(response.text).toContain('<img src="/assets/images/progress-group.svg" alt="" width="35" height="24">')
  })

  it('marks the nav item as active', async () => {
    mockData()

    const response = await renderProgress()

    expect(response.text).toMatch(/govuk-service-navigation__item--active[\s\S]*?href="\/progress"/)
  })

  it('hides unpaid work and RAR when the order has neither requirement', async () => {
    mockData({ requirements: [{ mainCategory: { code: 'X', description: 'Mental Health Treatment' } }] })

    const response = await renderProgress()

    expect(response.text).toContain('probation appointments')
    expect(response.text).toContain('You have achieved 1')
    expect(response.text).not.toContain('community payback (unpaid work)')
    expect(response.text).not.toContain('RAR day')
  })

  it('still shows unpaid work and RAR rows when nothing has been completed yet', async () => {
    mockData({ requirements: [unpaidWork({ completed: undefined }), rar({ completed: 1 })] })

    const response = await renderProgress()

    expect(response.text).toContain('You have completed 0 hours of')
    expect(response.text).toContain('>RAR day</a>')
  })

  it('uses the singular for one appointment, hour and goal', async () => {
    mockData({
      appointments: [attended()],
      requirements: [unpaidWork({ completed: 1 })],
      goals: [{ goalStatus: 'ACHIEVED' }],
    })

    const response = await renderProgress()

    expect(response.text).toContain('>probation appointment</a>')
    expect(response.text).toContain('You have completed 1 hour of')
    expect(response.text).toContain('>goal</a>')
  })

  it('uses the singular for one RAR day', async () => {
    mockData({ requirements: [rar({ completed: 1 })] })

    const response = await renderProgress()

    expect(response.text).toContain('You have completed 1 <a')
    expect(response.text).toContain('>RAR day</a>')
  })

  it('takes the unit from the requirement rather than assuming hours and days', async () => {
    mockData({ requirements: [unpaidWork({ unit: 'DAYS', completed: 3 }), rar({ unit: 'WEEKS', completed: 2 })] })

    const response = await renderProgress()

    expect(response.text).toContain('You have completed 3 days of')
    expect(response.text).toContain('>RAR weeks</a>')
  })

  it('falls back to "units" when the requirement has no unit', async () => {
    mockData({ requirements: [unpaidWork({ unit: undefined, completed: 4 })] })

    const response = await renderProgress()

    expect(response.text).toContain('You have completed 4 units of')
  })

  it('shows 0 goals when there is no sentence plan yet', async () => {
    mockData()
    peopleOnProbationService.getSentencePlan.mockRejectedValue({ responseStatus: 404 })

    const response = await renderProgress()

    expect(response.status).toBe(200)
    expect(response.text).toContain('You have achieved 0')
  })

  it('hides only the rows whose data could not be loaded', async () => {
    mockData()
    peopleOnProbationService.getSentencePlan.mockRejectedValue({ responseStatus: 500 })
    peopleOnProbationService.getAllPastAppointments.mockRejectedValue(new Error('timeout'))

    const response = await renderProgress()

    expect(response.status).toBe(200)
    expect(response.text).not.toContain('probation appointment')
    expect(response.text).not.toContain('You have achieved')
    expect(response.text).toContain('community payback (unpaid work)')
  })

  it('hides the attendance row when the past appointments are too many pages to fetch', async () => {
    mockData()
    peopleOnProbationService.getAllPastAppointments.mockRejectedValue(
      new Error('Past appointments need 49 more pages, over the limit of 10'),
    )

    const response = await renderProgress()

    expect(response.status).toBe(200)
    expect(response.text).not.toContain('probation appointment')
    expect(response.text).toContain('You have achieved 1')
  })

  it('shows the error page when nothing could be loaded', async () => {
    peopleOnProbationService.getAllPastAppointments.mockRejectedValue(new Error('down'))
    peopleOnProbationService.getSentences.mockRejectedValue(new Error('down'))
    peopleOnProbationService.getSentencePlan.mockRejectedValue(new Error('down'))

    const response = await renderProgress()

    expect(response.status).toBe(500)
  })

  it('includes requirements from every concurrent order', async () => {
    peopleOnProbationService.getAllPastAppointments.mockResolvedValue([])
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [
        { requirements: [unpaidWork()], licenceConditions: [] },
        { requirements: [rar()], licenceConditions: [] },
      ],
    })
    peopleOnProbationService.getSentencePlan.mockResolvedValue({ goals: [] })

    const response = await renderProgress()

    expect(response.text).toContain('You have completed 35 hours of')
    expect(response.text).toContain('You have completed 9 <a')
  })

  it('redirects users without a person reference to auth error', async () => {
    const response = await request(app)
      .get('/progress')
      .set('Cookie', await createAppSessionCookie(undefined))

    expect(response.status).toBe(302)
    expect(response.headers.location).toBe('/autherror')
  })
})

describe('GET /progress overall progress and ending early', () => {
  const originalLicenceFlag = config.features.licence
  const originalEarlyTerminationFlag = config.features.earlyTermination

  beforeEach(() => {
    config.features.licence = true
    config.features.earlyTermination = true
  })

  afterEach(() => {
    config.features.licence = originalLicenceFlag
    config.features.earlyTermination = originalEarlyTerminationFlag
  })

  const mockSentences = (sentences: SentenceResponse[]) => {
    peopleOnProbationService.getAllPastAppointments.mockResolvedValue([])
    peopleOnProbationService.getSentences.mockResolvedValue({ sentences })
    peopleOnProbationService.getSentencePlan.mockResolvedValue({ goals: [] })
  }

  const communityOrder = (overrides: Partial<SentenceResponse> = {}): SentenceResponse => ({
    typeCode: '340',
    startDate: '2026-01-01',
    expectedEndDate: '2027-07-15',
    requirements: [unpaidWork()],
    licenceConditions: [],
    ...overrides,
  })

  const licence = (overrides: Partial<SentenceResponse> = {}): SentenceResponse => ({
    startDate: '2026-01-01',
    expectedEndDate: '2027-07-15',
    requirements: [],
    licenceConditions: [{ mainCategory: { code: 'NLC8', description: 'Standard licence conditions' } }],
    ...overrides,
  })

  // The licence's own dates: CVL's licence start date and Prisoner Search's licence expiry date.
  const mockLicenceDates = ({
    licenceStartDate = '2026-06-01',
    licenceExpiryDate = '2027-07-15',
    indeterminateSentence,
  }: { licenceStartDate?: string; licenceExpiryDate?: string; indeterminateSentence?: boolean } = {}) => {
    peopleOnProbationService.getLicences.mockResolvedValue([{ id: 7, licenceExpiryDate, indeterminateSentence }])
    peopleOnProbationService.getLicence.mockResolvedValue({ id: 7, licenceStartDate })
  }

  it('shows the progress in the overall order, above the achievements', async () => {
    mockSentences([communityOrder()])

    const response = await renderProgress()

    const progress = response.text.indexOf('<h2 class="govuk-heading-s">Progress in overall order</h2>')
    const achievements = response.text.indexOf('<h2 class="govuk-heading-s">Your achievements</h2>')
    expect(progress).toBeGreaterThan(-1)
    expect(achievements).toBeGreaterThan(progress)
    expect(response.text).toContain('role="progressbar"')
    expect(response.text).toContain('Completed: ')
    expect(response.text).toContain('Remaining: ')
    expect(response.text).not.toContain('You are on licence')
  })

  it('shows one progress bar for matching concurrent orders', async () => {
    mockSentences([communityOrder(), communityOrder({ requirements: [rar()] })])

    const response = await renderProgress()

    expect(response.text.match(/role="progressbar"/g)).toHaveLength(1)
  })

  it('shows a progress bar for each order that does not match, headed by its type, in API order', async () => {
    mockSentences([
      communityOrder({ type: 'SA2020 Community Order' }),
      communityOrder({
        type: 'SA2020 Suspended Sentence Order',
        typeCode: '341',
        startDate: '2025-09-01',
        requirements: [rar()],
      }),
    ])

    const response = await renderProgress()

    const communityOrderHeading = response.text.indexOf('>Community Order</h2>')
    const suspendedHeading = response.text.indexOf('>Suspended Sentence Order</h2>')
    const achievements = response.text.indexOf('<h2 class="govuk-heading-s">Your achievements</h2>')
    expect(communityOrderHeading).toBeGreaterThan(-1)
    expect(suspendedHeading).toBeGreaterThan(communityOrderHeading)
    expect(achievements).toBeGreaterThan(suspendedHeading)
    expect(response.text.match(/<h3 class="govuk-heading-s">Progress in overall order<\/h3>/g)).toHaveLength(2)
    expect(response.text.match(/role="progressbar"/g)).toHaveLength(2)
  })

  it('shows matching orders as one bar among orders that do not match', async () => {
    mockSentences([communityOrder(), communityOrder({ typeCode: '341' }), communityOrder()])

    const response = await renderProgress()

    expect(response.text.match(/role="progressbar"/g)).toHaveLength(2)
  })

  it('hides the order progress when the order has no start or expected end date', async () => {
    mockSentences([communityOrder({ startDate: undefined })])

    const response = await renderProgress()

    expect(response.text).not.toContain('Progress in overall order')
    expect(response.text).not.toContain('role="progressbar"')
  })

  it('shows only the time until the licence ends for someone on licence', async () => {
    mockSentences([licence()])
    mockLicenceDates()

    const response = await renderProgress()

    const progress = response.text.indexOf('<h2 class="govuk-heading-s">Time until your licence ends</h2>')
    expect(progress).toBeGreaterThan(-1)
    expect(response.text.indexOf('Your achievements')).toBeGreaterThan(progress)
    expect(response.text).toContain('role="progressbar"')
    expect(response.text).toContain('Remaining: ')
    expect(response.text).not.toContain('Your progress')
    expect(response.text).not.toContain('You are on licence')
    expect(response.text).not.toContain('Until 15 July 2027')
    expect(response.text).not.toContain('Progress in overall order')
  })

  it('shows the time until the licence ends, then the order progress, for someone on licence and an order', async () => {
    // The order first, as in the API's data: the licence is still shown first.
    mockSentences([communityOrder(), licence()])
    mockLicenceDates()

    const response = await renderProgress()

    const licenceHeading = response.text.indexOf('<h2 class="govuk-heading-s">Time until your licence ends</h2>')
    const orderHeading = response.text.indexOf('<h2 class="govuk-heading-s">Progress in overall order</h2>')
    expect(licenceHeading).toBeGreaterThan(-1)
    expect(orderHeading).toBeGreaterThan(licenceHeading)
    expect(response.text.match(/role="progressbar"/g)).toHaveLength(2)
    expect(response.text).not.toContain('Community Order</h2>')
  })

  it('hides the time until the licence ends for an indeterminate sentence', async () => {
    mockSentences([licence()])
    mockLicenceDates({ indeterminateSentence: true })

    const response = await renderProgress()

    expect(response.text).not.toContain('Time until your licence ends')
    expect(response.text).not.toContain('role="progressbar"')
    expect(response.text).toContain('Your achievements')
    expect(response.text).toContain('Ending your probation early')
  })

  it('shows the time from release to the licence expiry date, not the whole sentence', async () => {
    jest.useFakeTimers({ now: new Date('2026-07-01T12:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] })
    try {
      mockSentences([licence({ startDate: '2021-01-01', expectedEndDate: '2026-12-31' })])
      mockLicenceDates({ licenceStartDate: '2026-01-01', licenceExpiryDate: '2026-12-31' })

      const response = await renderProgress()

      expect(response.text).toContain('aria-valuenow="50"')
      expect(response.text).toContain('Remaining: 6 months')
    } finally {
      jest.useRealTimers()
    }
  })

  it('hides the time until the licence ends when the licence cannot be loaded', async () => {
    mockSentences([licence()])
    peopleOnProbationService.getLicences.mockRejectedValue(new Error('CVL down'))

    const response = await renderProgress()

    expect(response.status).toBe(200)
    expect(response.text).not.toContain('Time until your licence ends')
    expect(response.text).toContain('Your achievements')
  })

  it.each([
    ['start date', { licenceStartDate: null as string }],
    ['expiry date', { licenceExpiryDate: null as string }],
  ])('hides the licence progress when the licence has no %s', async (_, dates) => {
    mockSentences([licence()])
    mockLicenceDates(dates)

    const response = await renderProgress()

    expect(response.text).not.toContain('Time until your licence ends')
    expect(response.text).not.toContain('role="progressbar"')
  })

  it.each([
    ['an order', () => [communityOrder()]],
    ['a licence', () => [licence()]],
  ])('shows the ending your probation early guidance for %s', async (_, sentences) => {
    mockSentences(sentences())

    const response = await renderProgress()

    expect(response.text).toContain('<h2 class="govuk-heading-s">Ending your probation early</h2>')
    expect(response.text).toContain('the panel will make the final decision')
  })

  it('hides the ending your probation early guidance when the feature is off', async () => {
    config.features.earlyTermination = false
    mockSentences([communityOrder()])

    const response = await renderProgress()

    expect(response.status).toBe(200)
    expect(response.text).toContain('Your achievements')
    expect(response.text).not.toContain('Ending your probation early')
  })

  it('still shows the achievements and guidance, without any progress, when sentences cannot be loaded', async () => {
    mockData()
    peopleOnProbationService.getAllPastAppointments.mockResolvedValue([attended()])
    peopleOnProbationService.getSentences.mockRejectedValue(new Error('timeout'))

    const response = await renderProgress()

    expect(response.status).toBe(200)
    expect(response.text).not.toContain('role="progressbar"')
    expect(response.text).toContain('Your achievements')
    expect(response.text).toContain('Ending your probation early')
  })
})

describe('countAttendedAppointments', () => {
  it('counts attended appointments, leaving out missed ones and unpaid work', () => {
    expect(
      countAttendedAppointments([
        attended(),
        attended({ attended: false }),
        attended({ attended: undefined }),
        attended({ unpaidWork: {} }),
        attended({ unpaidWork: null }),
      ]),
    ).toBe(2)
  })
})

describe('requirementProgress', () => {
  it('totals completed hours across several unpaid work requirements and links to the requirements page', () => {
    const sentence: SentenceResponse = {
      requirements: [
        unpaidWork({ completed: 10, subCategory: { code: 'W01', description: 'Regular' } }),
        unpaidWork({ completed: 5, subCategory: { code: 'W02', description: 'Additional Hours' } }),
      ],
      licenceConditions: [],
    }

    expect(requirementProgress(sentence, 'unpaid-work')).toEqual({
      completed: 15,
      unit: 'HOURS',
      href: '/your-probation',
    })
  })

  it('caps each requirement at its required amount, matching the requirement detail page', () => {
    const sentence: SentenceResponse = {
      requirements: [
        unpaidWork({ required: 40, completed: 45, subCategory: { code: 'W01', description: 'Regular' } }),
        unpaidWork({ required: 20, completed: 10, subCategory: { code: 'W02', description: 'Additional Hours' } }),
      ],
      licenceConditions: [],
    }

    expect(requirementProgress(sentence, 'unpaid-work')?.completed).toBe(50)
  })

  it('counts 0 for a requirement with no required amount, as its detail page shows no completed figure', () => {
    const sentence: SentenceResponse = {
      requirements: [rar({ required: undefined, completed: 5 })],
      licenceConditions: [],
    }

    expect(requirementProgress(sentence, 'rar')).toEqual({
      completed: 0,
      unit: undefined,
      href: '/your-probation/rehabilitation-activity-requirement-rar',
    })
  })

  it('ignores the administrative RAR requirement from MPOP', () => {
    const sentence: SentenceResponse = {
      requirements: [{ mainCategory: { code: 'RAR', description: 'Rehabilitation Activity Requirement' } }, rar()],
      licenceConditions: [],
    }

    expect(requirementProgress(sentence, 'rar')).toEqual({
      completed: 9,
      unit: 'DAYS',
      href: '/your-probation/rehabilitation-activity-requirement-rar',
    })
  })

  it('is undefined when there is no sentence or no matching requirement', () => {
    expect(requirementProgress(undefined, 'rar')).toBeUndefined()
    expect(requirementProgress({ requirements: [unpaidWork()], licenceConditions: [] }, 'rar')).toBeUndefined()
  })
})
