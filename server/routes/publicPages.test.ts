import type { Express } from 'express'
import request from 'supertest'
import { appWithAllRoutes } from './testutils/appSetup'

let app: Express

beforeEach(() => {
  app = appWithAllRoutes({})
})

describe('GET /cookies', () => {
  it('should render the cookies page without authentication', async () => {
    const response = await request(app).get('/cookies').expect('Content-Type', /html/).expect(200)

    expect(response.text).toContain('Cookies policy')
    expect(response.text).toContain('hmpps-people-on-probation-ui.app-session')
    expect(response.text).toContain('hmpps-people-on-probation-ui.session')
  })

  it('should display the session expiry duration from config', async () => {
    const response = await request(app).get('/cookies').expect(200)

    expect(response.text).toMatch(/after \d+ minutes of inactivity/)
  })
})

describe('GET /privacy', () => {
  it('should render the privacy page without authentication', async () => {
    const response = await request(app).get('/privacy').expect('Content-Type', /html/).expect(200)

    expect(response.text).toContain('Privacy Notice')
    expect(response.text).toContain('Probation Service')
  })

  it('should contain key privacy notice sections', async () => {
    const response = await request(app).get('/privacy').expect(200)

    expect(response.text).toContain('Purpose')
    expect(response.text).toContain('Types of personal data we process')
    expect(response.text).toContain('Complaints')
    expect(response.text).toContain('Information Commissioner')
  })
})

describe('GET /autherror', () => {
  it('should render the auth error page with 403 without authentication', async () => {
    const response = await request(app).get('/autherror').expect('Content-Type', /html/).expect(403)

    expect(response.text).toContain('You cannot use this service')
    expect(response.text).toContain('You do not have permission to access this service.')
  })
})

describe('GET /invite-expired', () => {
  it('should render the invite expired page with 410 without authentication', async () => {
    const response = await request(app).get('/invite-expired').expect('Content-Type', /html/).expect(410)

    expect(response.text).toContain('Your invite has expired')
    expect(response.text).toContain('Contact your probation officer to ask them to send a new link.')
  })
})

describe('GET /sign-in-error', () => {
  it('should render the sign-in error page with 500 without authentication', async () => {
    const response = await request(app).get('/sign-in-error').expect('Content-Type', /html/).expect(500)

    expect(response.text).toContain('Sorry, we could not sign you in')
    expect(response.text).toContain('We could not sign you in using GOV.UK One Login.')
  })
})
