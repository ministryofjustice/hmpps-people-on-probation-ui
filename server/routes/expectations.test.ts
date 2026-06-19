import type { Express } from 'express'
import request from 'supertest'
import { appWithAllRoutes, createAppSessionCookie } from './testutils/appSetup'

let app: Express

beforeEach(() => {
  app = appWithAllRoutes({})
})

afterEach(() => {
  jest.resetAllMocks()
})

describe('GET /expectations', () => {
  describe('authentication', () => {
    it('redirects unauthenticated users to the sign-in page', async () => {
      const res = await request(app).get('/expectations')

      expect(res.status).toBe(302)
      expect(res.headers.location).toMatch(/^\/$|returnTo/)
    })

    it('renders the page for authenticated users', async () => {
      const cookie = await createAppSessionCookie()

      const res = await request(app).get('/expectations').set('Cookie', cookie)

      expect(res.status).toBe(200)
    })
  })

  describe('tab query handling', () => {
    it('defaults to the probation-service tab when no tab param is given', async () => {
      const cookie = await createAppSessionCookie()

      const res = await request(app).get('/expectations').set('Cookie', cookie)

      expect(res.status).toBe(200)
      expect(res.text).toContain('id="panel-probation-service"')
      expect(res.text).not.toContain('id="panel-probation-service" hidden')
      expect(res.text).toContain('id="panel-you" hidden')
    })

    it('defaults to the probation-service tab for an unrecognised tab param', async () => {
      const cookie = await createAppSessionCookie()

      const res = await request(app).get('/expectations?tab=unknown').set('Cookie', cookie)

      expect(res.status).toBe(200)
      expect(res.text).not.toContain('id="panel-probation-service" hidden')
      expect(res.text).toContain('id="panel-you" hidden')
    })

    it('shows the you tab when tab=you', async () => {
      const cookie = await createAppSessionCookie()

      const res = await request(app).get('/expectations?tab=you').set('Cookie', cookie)

      expect(res.status).toBe(200)
      expect(res.text).toContain('id="panel-probation-service" hidden')
      expect(res.text).toContain('id="panel-you"')
      expect(res.text).not.toContain('id="panel-you" hidden')
    })
  })

  describe('page content', () => {
    it('renders the page heading', async () => {
      const cookie = await createAppSessionCookie()

      const res = await request(app).get('/expectations').set('Cookie', cookie)

      expect(res.text).toContain('Agreement between you and the Probation Service')
    })

    it('renders both tab navigation links', async () => {
      const cookie = await createAppSessionCookie()

      const res = await request(app).get('/expectations').set('Cookie', cookie)

      expect(res.text).toContain('What to expect from the Probation Service')
      expect(res.text).toContain('Expectations of you on probation')
    })
  })
})
