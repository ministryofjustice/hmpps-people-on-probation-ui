import type { Express } from 'express'
import request from 'supertest'
import { appWithAllRoutes, createAppSessionCookie } from './testutils/appSetup'
import { appSessionCookieName } from '../auth/cookies'
import type { Services } from '../services'
import type { SentencePlanResponse } from '../data/peopleOnProbationApiClient'

let app: Express
let peopleOnProbationService: { getSentencePlan: jest.Mock }

const activePlan: SentencePlanResponse = {
  crn: 'X123456',
  nomis: 'A1234BC',
  planStatus: 'AGREED',
  goals: [
    {
      goalTitle: 'Find accommodation',
      areaOfNeed: 'ACCOMMODATION',
      relatedAreaOfNeed: [],
      targetDate: '2026-09-01',
      goalStatus: 'ACTIVE',
      steps: [
        {
          description: 'Contact housing service',
          status: 'COMPLETED',
          actor: 'PERSON_ON_PROBATION',
          statusDate: '2026-05-01T10:00:00Z',
        },
        {
          description: 'Submit application',
          status: 'IN_PROGRESS',
          actor: 'PROBATION_PRACTITIONER',
          statusDate: '2026-05-10T10:00:00Z',
        },
      ],
    },
    {
      goalTitle: 'Improve finances',
      areaOfNeed: 'FINANCES',
      relatedAreaOfNeed: [],
      targetDate: '2026-12-01',
      goalStatus: 'FUTURE',
      steps: [
        {
          description: 'Attend budgeting course',
          status: 'NOT_STARTED',
          actor: 'PERSON_ON_PROBATION',
          statusDate: '2026-04-01T10:00:00Z',
        },
      ],
    },
    {
      goalTitle: 'Maintain mental health',
      areaOfNeed: 'HEALTH_AND_WELLBEING',
      relatedAreaOfNeed: [],
      targetDate: '2026-03-01',
      goalStatus: 'ACHIEVED',
      steps: [
        {
          description: 'See counsellor',
          status: 'COMPLETED',
          actor: 'PERSON_ON_PROBATION',
          statusDate: '2026-03-15T10:00:00Z',
        },
      ],
    },
  ],
}

beforeEach(() => {
  peopleOnProbationService = { getSentencePlan: jest.fn() }
  app = appWithAllRoutes({ services: { peopleOnProbationService } as unknown as Partial<Services> })
})

afterEach(() => {
  jest.resetAllMocks()
})

describe('GET /goals', () => {
  describe('authentication', () => {
    it('redirects unauthenticated users to sign in', async () => {
      await request(app).get('/goals').expect(302).expect('Location', '/?returnTo=%2Fgoals')
    })

    it('redirects authenticated user without a person reference to auth error', async () => {
      await request(app)
        .get('/goals')
        .set('Cookie', await createAppSessionCookie())
        .expect(302)
        .expect('Location', '/autherror')
    })

    it('redirects expired session to session timeout page', async () => {
      await request(app)
        .get('/goals')
        .set('Cookie', `${appSessionCookieName}=expired-session-id`)
        .expect(302)
        .expect('Location', '/session-timeout')
    })
  })

  describe('tab selection', () => {
    beforeEach(() => {
      peopleOnProbationService.getSentencePlan.mockResolvedValue(activePlan)
    })

    it('defaults to the current tab when no tab query param is provided', async () => {
      const res = await request(app)
        .get('/goals')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('aria-current="page"')
      expect(res.text).toContain('Goals to work on now')
    })

    it('renders the future tab when tab=future', async () => {
      const res = await request(app)
        .get('/goals?tab=future')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('Future goals')
    })

    it('renders the achieved tab when tab=achieved', async () => {
      const res = await request(app)
        .get('/goals?tab=achieved')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('Achieved goals')
    })

    it('falls back to current tab for an invalid tab param', async () => {
      const res = await request(app)
        .get('/goals?tab=invalid')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('Goals to work on now')
    })
  })

  describe('goal rendering', () => {
    beforeEach(() => {
      peopleOnProbationService.getSentencePlan.mockResolvedValue(activePlan)
    })

    it('renders current (ACTIVE) goal title on the current tab', async () => {
      const res = await request(app)
        .get('/goals')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('<h2 class="pop-goal-card__title">Find accommodation</h2>')
    })

    it('renders future (FUTURE) goal title on the future tab', async () => {
      const res = await request(app)
        .get('/goals?tab=future')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('Improve finances')
    })

    it('renders achieved (ACHIEVED) goal title on the achieved tab', async () => {
      const res = await request(app)
        .get('/goals?tab=achieved')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('Maintain mental health')
    })

    it('maps actor codes to human-readable labels', async () => {
      const res = await request(app)
        .get('/goals')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('You')
      expect(res.text).toContain('Probation officer')
    })

    it('maps step status codes to tags', async () => {
      const res = await request(app)
        .get('/goals')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('Completed')
      expect(res.text).toContain('In progress')
    })

    it('shows the "x of y steps completed" progress line and a Steps column, not tasks', async () => {
      const res = await request(app)
        .get('/goals')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('1 of 2 steps completed.')
      expect(res.text).toContain('<th scope="col" class="govuk-table__header">Steps</th>')
      expect(res.text).not.toContain('task')
    })

    it('formats the target date', async () => {
      const res = await request(app)
        .get('/goals')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('1 September 2026')
    })

    it('calls getSentencePlan with the user CRN', async () => {
      await request(app)
        .get('/goals')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(peopleOnProbationService.getSentencePlan).toHaveBeenCalledWith('X123456')
    })
  })

  describe('last updated banner', () => {
    it('shows the last updated date from the latest step across all goals', async () => {
      peopleOnProbationService.getSentencePlan.mockResolvedValue(activePlan)

      const res = await request(app)
        .get('/goals')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      // latest statusDate across all goals is 2026-05-10
      expect(res.text).toContain('goals-last-updated')
      expect(res.text).toContain('10 May 2026')
    })

    it('does not render the last updated banner when there are no goals', async () => {
      peopleOnProbationService.getSentencePlan.mockResolvedValue({ ...activePlan, goals: [] })

      const res = await request(app)
        .get('/goals')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).not.toContain('goals-last-updated')
    })

    it('hides the last updated banner on the achieved tab', async () => {
      peopleOnProbationService.getSentencePlan.mockResolvedValue(activePlan)

      const res = await request(app)
        .get('/goals?tab=achieved')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('id="goals-last-updated" hidden')
    })
  })

  describe('achieved date per goal', () => {
    it('shows "Marked as achieved" with the latest step date on the achieved tab', async () => {
      peopleOnProbationService.getSentencePlan.mockResolvedValue(activePlan)

      const res = await request(app)
        .get('/goals?tab=achieved')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('Marked as achieved on 15 March 2026.')
    })

    it('does not show achieved date when there are no achieved goals', async () => {
      const planWithNoAchieved: SentencePlanResponse = {
        ...activePlan,
        goals: activePlan.goals.filter(g => g.goalStatus !== 'ACHIEVED'),
      }
      peopleOnProbationService.getSentencePlan.mockResolvedValue(planWithNoAchieved)

      const res = await request(app)
        .get('/goals?tab=achieved')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).not.toContain('Marked as achieved on')
    })
  })

  describe('empty plan', () => {
    it('renders successfully with no goals when the plan is null', async () => {
      peopleOnProbationService.getSentencePlan.mockResolvedValue(null)

      const res = await request(app)
        .get('/goals')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).not.toContain('goals-last-updated')
      expect(res.text).not.toContain('Marked as achieved on')
    })

    it('renders 0 counts in the tab navigation when there are no goals', async () => {
      peopleOnProbationService.getSentencePlan.mockResolvedValue({ ...activePlan, goals: [] })

      const res = await request(app)
        .get('/goals')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('Goals to work on now (0)')
      expect(res.text).toContain('Future goals (0)')
      expect(res.text).toContain('Achieved goals (0)')
    })
  })

  describe('error handling', () => {
    it('renders goals page with empty tabs when the API returns 404', async () => {
      const notFoundError = Object.assign(new Error('Not found'), { responseStatus: 404 })
      peopleOnProbationService.getSentencePlan.mockRejectedValue(notFoundError)

      const res = await request(app)
        .get('/goals')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(res.text).toContain('Goals to work on now (0)')
      expect(res.text).toContain('Future goals (0)')
      expect(res.text).toContain('Achieved goals (0)')
      expect(res.text).not.toContain('goals-last-updated')
      expect(res.text).not.toContain('Marked as achieved on')
    })

    it('passes non-404 API errors to the next error handler', async () => {
      const serverError = Object.assign(new Error('API error'), { responseStatus: 500 })
      peopleOnProbationService.getSentencePlan.mockRejectedValue(serverError)

      await request(app)
        .get('/goals')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(500)
    })
  })
})
