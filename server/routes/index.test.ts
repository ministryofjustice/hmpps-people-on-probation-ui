import type { Express } from 'express'
import request from 'supertest'
import { addDays, format } from 'date-fns'
import { appWithAllRoutes, createAppSessionCookie } from './testutils/appSetup'
import { appSessionCookieName } from '../auth/cookies'
import type { Services } from '../services'
import config from '../config'
import type { SentenceResponse } from '../data/peopleOnProbationApiClient'

let app: Express
let peopleOnProbationService: {
  getFutureAppointments: jest.Mock
  getPastAppointments: jest.Mock
  getSentences: jest.Mock
}

beforeEach(() => {
  config.features.missedAppointmentAlert = true
  config.features.licence = true

  peopleOnProbationService = {
    getFutureAppointments: jest.fn(),
    getPastAppointments: jest.fn(),
    getSentences: jest.fn(),
  }

  app = appWithAllRoutes({
    services: {
      peopleOnProbationService,
    } as unknown as Partial<Services>,
  })
})

afterEach(() => {
  config.features.missedAppointmentAlert = false
  config.features.licence = false
  jest.useRealTimers()
  jest.resetAllMocks()
})

describe('GET /', () => {
  it('should render index page', () => {
    return request(app).get('/').expect('Content-Type', /html/).expect(200)
  })

  it('should link to sign in start with the registration invite token', async () => {
    const response = await request(app).get('/?token=invite-token').expect('Content-Type', /html/).expect(200)

    expect(response.text).toContain('href="/sign-in/start?token=invite-token"')
  })

  it('should link to sign in start with returnTo and registration invite token', async () => {
    const response = await request(app)
      .get('/?returnTo=/appointments&token=invite-token')
      .expect('Content-Type', /html/)
      .expect(200)

    expect(response.text).toContain('href="/sign-in/start?returnTo=%2Fappointments&amp;token=invite-token"')
  })

  it('should render the authenticated home page with appointment and order progress summaries', async () => {
    peopleOnProbationService.getFutureAppointments.mockResolvedValue({
      content: [
        {
          date: '2026-06-10',
          startTime: '09:00',
          endTime: '10:00',
          nationalStandards: true,
        },
      ],
    })
    peopleOnProbationService.getPastAppointments.mockResolvedValue({
      content: [
        {
          date: '2026-06-01',
          lastUpdatedAt: '2026-06-01T10:00:00Z',
          nationalStandards: true,
          attended: false,
        },
      ],
    })
    const expectedEndDate = format(addDays(new Date(), 7), 'yyyy-MM-dd')
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [
        {
          startDate: '2026-06-01',
          expectedEndDate,
          requirements: [],
          licenceConditions: [],
        },
      ],
    })

    const response = await request(app)
      .get('/')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect('Content-Type', /html/)
      .expect(200)

    expect(response.text).toContain('Check your probation account')
    expect(response.text).toContain('Next mandatory appointment')
    expect(response.text).toContain('Wednesday 10 June 2026, 9am to 10am')
    expect(response.text).toContain('Missed mandatory appointment or activity')
    expect(response.text).toContain('Monday 1 June 2026')
    expect(response.text).toContain('Progress in overall order')
    expect(peopleOnProbationService.getFutureAppointments).toHaveBeenCalledWith('X123456', 0, 50)
    expect(peopleOnProbationService.getPastAppointments).toHaveBeenCalledWith('X123456', 0, 50)
    expect(peopleOnProbationService.getSentences).toHaveBeenCalledWith('X123456')
  })

  it('should not render the missed appointment alert when the feature flag is disabled', async () => {
    config.features.missedAppointmentAlert = false
    peopleOnProbationService.getFutureAppointments.mockResolvedValue({ content: [] })
    peopleOnProbationService.getPastAppointments.mockResolvedValue({
      content: [
        {
          date: '2026-06-01',
          nationalStandards: true,
          attended: false,
        },
      ],
    })
    peopleOnProbationService.getSentences.mockResolvedValue({ sentences: [] })

    const response = await request(app)
      .get('/')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).not.toContain('Missed mandatory appointment or activity')
  })

  it('should redirect authenticated users without a person reference to auth error', async () => {
    await request(app)
      .get('/')
      .set('Cookie', await createAppSessionCookie())
      .expect(302)
      .expect('Location', '/autherror')
  })

  it('should redirect users with an expired app session cookie to the session timeout page', async () => {
    await request(app)
      .get('/')
      .set('Cookie', `${appSessionCookieName}=expired-session-id`)
      .expect(302)
      .expect('Location', '/session-timeout')
  })

  it('should not render order progress when the first sentence has no start or expected end date', async () => {
    peopleOnProbationService.getFutureAppointments.mockResolvedValue({ content: [] })
    peopleOnProbationService.getPastAppointments.mockResolvedValue({ content: [] })
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [
        {
          requirements: [],
          licenceConditions: [],
        },
      ],
    })

    const response = await request(app)
      .get('/')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect('Content-Type', /html/)
      .expect(200)

    expect(response.text).not.toContain('Progress in overall order')
  })

  describe('when the licence feature is off', () => {
    const licenceSentence: SentenceResponse = {
      requirements: [],
      licenceConditions: [{ mainCategory: { code: 'NLC8', description: 'Standard licence conditions' } }],
    }

    beforeEach(() => {
      config.features.licence = false
      peopleOnProbationService.getFutureAppointments.mockResolvedValue({ content: [] })
      peopleOnProbationService.getPastAppointments.mockResolvedValue({ content: [] })
    })

    it.each(['/', '/appointments', '/goals', '/requirements', '/licence', '/probation-officer', '/details'])(
      'sends a licence user on %s to the error page',
      async path => {
        peopleOnProbationService.getSentences.mockResolvedValue({ sentences: [licenceSentence] })

        await request(app)
          .get(path)
          .set('Cookie', await createAppSessionCookie('X123456'))
          .expect(302)
          .expect('Location', '/autherror')
      },
    )

    it('still lets a community order user into their account', async () => {
      peopleOnProbationService.getSentences.mockResolvedValue({
        sentences: [
          {
            startDate: '2026-01-01',
            expectedEndDate: '2027-07-15',
            requirements: [{ mainCategory: { code: 'F', description: 'Rehabilitation activity requirement' } }],
            licenceConditions: [],
          },
        ],
      })

      const response = await request(app)
        .get('/')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(response.text).toContain('Progress in overall order')
    })

    it('still shows the start page to signed-out visitors', async () => {
      await request(app).get('/').expect(200)
      expect(peopleOnProbationService.getSentences).not.toHaveBeenCalled()
    })

    it('renders the error page for a blocked licence user without redirecting again', async () => {
      peopleOnProbationService.getSentences.mockResolvedValue({ sentences: [licenceSentence] })

      const response = await request(app)
        .get('/autherror')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(403)

      expect(response.text).toContain('You cannot use this service')
    })
  })

  describe('licence sentence', () => {
    const licenceCondition = { mainCategory: { code: 'NLC8', description: 'Standard licence conditions' } }

    const renderHome = async (sentence: Record<string, unknown>) => {
      peopleOnProbationService.getFutureAppointments.mockResolvedValue({ content: [] })
      peopleOnProbationService.getPastAppointments.mockResolvedValue({ content: [] })
      peopleOnProbationService.getSentences.mockResolvedValue({ sentences: [sentence] })

      return request(app)
        .get('/')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect('Content-Type', /html/)
        .expect(200)
    }

    it('shows the licence status with the expiry date instead of the progress bar', async () => {
      const response = await renderHome({
        startDate: '2026-01-01',
        expectedEndDate: '2027-07-15',
        requirements: [],
        licenceConditions: [licenceCondition],
      })

      expect(response.text).toContain('Your progress')
      expect(response.text).not.toContain('Progress in overall order')
      expect(response.text).toContain('Time in prison completed')
      expect(response.text).toContain('You are on licence')
      expect(response.text).toContain('Until 15 July 2027')
      expect(response.text).not.toContain('pop-licence-progress__item--centred')
      expect(response.text).toContain('<img src="/assets/images/progress-complete.svg" alt=""')
      expect(response.text).toContain('<img src="/assets/images/licence-pin.svg" alt=""')
      expect(response.text).not.toContain('role="progressbar"')
    })

    it('labels the requirements tile and nav item "Your licence"', async () => {
      const response = await renderHome({ requirements: [], licenceConditions: [licenceCondition] })

      expect(response.text).toContain('See your sentence information and check your licence')
      expect(response.text).toMatch(/href="\/licence"[^>]*>\s*Your licence/)
      expect(response.text).toContain('<a href="/licence" class="pop-card">')
      expect(response.text).not.toContain('href="/requirements"')
      expect(response.text).not.toContain('Order requirements')
    })

    it('omits the expiry date when it is not populated', async () => {
      const response = await renderHome({ requirements: [], licenceConditions: [licenceCondition] })

      expect(response.text).toContain('Time in prison completed')
      expect(response.text).toContain('You are on licence')
      expect(response.text).not.toContain('Until ')
      expect(response.text).toContain('pop-licence-progress__item--centred')
      expect(response.text).not.toContain('role="progressbar"')
    })

    it('shows the progress bar and no licence status for a community order', async () => {
      const response = await renderHome({
        startDate: '2026-01-01',
        expectedEndDate: '2027-07-15',
        requirements: [{ mainCategory: { code: 'F', description: 'Rehabilitation activity requirement' } }],
        licenceConditions: [],
      })

      expect(response.text).toContain('role="progressbar"')
      expect(response.text).toContain('Progress in overall order')
      expect(response.text).toContain('Order requirements')
      expect(response.text).toContain('See progress against your order requirements')
      expect(response.text).not.toContain('Your licence')
      expect(response.text).not.toContain('Your progress')
      expect(response.text).not.toContain('You are on licence')
    })
  })

  it('should treat missed unpaid work as a mandatory activity', async () => {
    peopleOnProbationService.getFutureAppointments.mockResolvedValue({ content: [] })
    peopleOnProbationService.getPastAppointments.mockResolvedValue({
      content: [
        {
          date: '2026-06-12',
          lastUpdatedAt: '2026-06-12T10:00:00Z',
          startTime: '09:00',
          endTime: '12:00',
          nationalStandards: false,
          attended: false,
          unpaidWork: {},
        },
      ],
    })
    peopleOnProbationService.getSentences.mockResolvedValue({ sentences: [] })

    const response = await request(app)
      .get('/')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect('Content-Type', /html/)
      .expect(200)

    expect(response.text).toContain('Missed mandatory appointment or activity')
    expect(response.text).toContain('Friday 12 June 2026')
    expect(response.text).not.toContain('9am to 12pm')
  })

  it('shows all missed appointments during the first registration session', async () => {
    peopleOnProbationService.getFutureAppointments.mockResolvedValue({ content: [] })
    peopleOnProbationService.getPastAppointments.mockResolvedValue({
      content: [
        {
          date: '2025-12-20',
          lastUpdatedAt: '2025-12-20T10:00:00Z',
          nationalStandards: true,
          attended: false,
        },
      ],
    })
    peopleOnProbationService.getSentences.mockResolvedValue({ sentences: [] })

    const response = await request(app)
      .get('/')
      .set('Cookie', await createAppSessionCookie('X123456', undefined, true))
      .expect(200)

    expect(response.text).toContain('Missed mandatory appointment or activity')
    expect(response.text).toContain('Saturday 20 December 2025')
  })

  it('only alerts returning users about missed appointments updated after registration', async () => {
    peopleOnProbationService.getFutureAppointments.mockResolvedValue({ content: [] })
    peopleOnProbationService.getPastAppointments.mockResolvedValue({
      content: [
        {
          date: '2025-12-20',
          lastUpdatedAt: '2025-12-20T10:00:00Z',
          nationalStandards: true,
          attended: false,
        },
        {
          date: '2026-06-12',
          lastUpdatedAt: '2026-06-12T10:00:00Z',
          nationalStandards: true,
          attended: false,
        },
      ],
    })
    peopleOnProbationService.getSentences.mockResolvedValue({ sentences: [] })

    const response = await request(app)
      .get('/')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('Missed mandatory appointment or activity')
    expect(response.text).toContain('Friday 12 June 2026')
    expect(response.text).not.toContain('Saturday 20 December 2025')
  })
})

describe('GET /welcome', () => {
  it('shows the interstitial for a first-time user with no previous login', async () => {
    const response = await request(app)
      .get('/welcome?returnTo=/')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('Welcome to your probation account')
  })

  it('shows the interstitial when last login was more than 30 days ago', async () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()

    const response = await request(app)
      .get('/welcome?returnTo=/')
      .set('Cookie', await createAppSessionCookie('X123456', thirtyOneDaysAgo))
      .expect(200)

    expect(response.text).toContain('Welcome to your probation account')
  })

  it('redirects to returnTo when last login was within the last 30 days', async () => {
    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString()

    await request(app)
      .get('/welcome?returnTo=/appointments')
      .set('Cookie', await createAppSessionCookie('X123456', twentyDaysAgo))
      .expect('Location', '/appointments')
      .expect(302)
  })

  it('redirects unauthenticated users to sign in', async () => {
    await request(app).get('/welcome').expect(302)
  })
})
