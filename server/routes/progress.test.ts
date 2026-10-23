import type { Express } from 'express'
import request from 'supertest'
import { appWithAllRoutes, createAppSessionCookie } from './testutils/appSetup'
import type { Services } from '../services'
import type { AppointmentResponse, RequirementResponse, SentenceResponse } from '../data/peopleOnProbationApiClient'
import { countAttendedAppointments, requirementProgress } from './progress'

let app: Express
let peopleOnProbationService: {
  getAllPastAppointments: jest.Mock
  getSentences: jest.Mock
  getSentencePlan: jest.Mock
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
      'You have completed 35 hours of <a class="govuk-link govuk-link--no-visited-state" href="/requirements/community-payback-unpaid-work" data-tracking-id="progress_unpaid_work_link">community payback (unpaid work)</a>',
      'You have achieved 1 <a class="govuk-link govuk-link--no-visited-state" href="/goals?tab=achieved" data-tracking-id="progress_goals_link">goal</a>',
      'You have completed 9 <a class="govuk-link govuk-link--no-visited-state" href="/requirements/rehabilitation-activity-requirement-rar" data-tracking-id="progress_rar_link">RAR days</a>',
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

  it('redirects users without a person reference to auth error', async () => {
    const response = await request(app)
      .get('/progress')
      .set('Cookie', await createAppSessionCookie(undefined))

    expect(response.status).toBe(302)
    expect(response.headers.location).toBe('/autherror')
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
      href: '/requirements',
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
      href: '/requirements/rehabilitation-activity-requirement-rar',
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
      href: '/requirements/rehabilitation-activity-requirement-rar',
    })
  })

  it('is undefined when there is no sentence or no matching requirement', () => {
    expect(requirementProgress(undefined, 'rar')).toBeUndefined()
    expect(requirementProgress({ requirements: [unpaidWork()], licenceConditions: [] }, 'rar')).toBeUndefined()
  })
})
