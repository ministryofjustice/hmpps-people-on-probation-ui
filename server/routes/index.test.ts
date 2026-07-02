import type { Express } from 'express'
import request from 'supertest'
import { addDays, format } from 'date-fns'
import { appWithAllRoutes, createAppSessionCookie } from './testutils/appSetup'
import { appSessionCookieName } from '../auth/cookies'
import type { Services } from '../services'
import config from '../config'

let app: Express
let peopleOnProbationService: {
  getFutureAppointments: jest.Mock
  getPastAppointments: jest.Mock
  getSentences: jest.Mock
}

beforeEach(() => {
  config.features.missedAppointmentAlert = true

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
    expect(response.text).toContain('Overall order')
    expect(peopleOnProbationService.getFutureAppointments).toHaveBeenCalledWith('X123456', 0, 10)
    expect(peopleOnProbationService.getPastAppointments).toHaveBeenCalledWith('X123456', 0, 10)
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

    expect(response.text).not.toContain('Overall order')
  })

  it('should treat missed unpaid work as a mandatory activity', async () => {
    peopleOnProbationService.getFutureAppointments.mockResolvedValue({ content: [] })
    peopleOnProbationService.getPastAppointments.mockResolvedValue({
      content: [
        {
          date: '2026-06-12',
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
