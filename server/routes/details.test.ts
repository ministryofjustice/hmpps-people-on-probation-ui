import type { Express } from 'express'
import request from 'supertest'
import { appWithAllRoutes, createAppSessionCookie } from './testutils/appSetup'
import { appSessionCookieName } from '../auth/cookies'
import { createAuthenticatedUserSession, saveAuthenticatedUserSession } from '../auth/sessionStore'
import type { Services } from '../services'

let app: Express
let peopleOnProbationService: { getPersonalDetails: jest.Mock }

beforeEach(() => {
  peopleOnProbationService = { getPersonalDetails: jest.fn() }

  app = appWithAllRoutes({
    services: { peopleOnProbationService } as unknown as Partial<Services>,
  })
})

afterEach(() => {
  jest.resetAllMocks()
})

describe('GET /details', () => {
  it('should redirect unauthenticated users to the sign-in page with returnTo', async () => {
    await request(app).get('/details').expect(302).expect('Location', '/?returnTo=%2Fdetails')
  })

  it('should redirect users with an expired session to the session timeout page', async () => {
    await request(app)
      .get('/details')
      .set('Cookie', `${appSessionCookieName}=expired-session-id`)
      .expect(302)
      .expect('Location', '/session-timeout')
  })

  it('should redirect authenticated users without a person reference to auth error', async () => {
    await request(app)
      .get('/details')
      .set('Cookie', await createAppSessionCookie())
      .expect(302)
      .expect('Location', '/autherror')
  })

  it('should render personal, contact and emergency contact details', async () => {
    peopleOnProbationService.getPersonalDetails.mockResolvedValue({
      name: { forename: 'John', surname: 'Smith' },
      preferredName: 'Johnny',
      dateOfBirth: '1990-05-15',
      mainAddress: {
        houseNumber: '12',
        street: 'High Street',
        town: 'London',
        postcode: 'SW1A 1AA',
      },
      telephoneNumber: '01234567890',
      mobileNumber: '07700900000',
      emailAddress: 'john.smith@example.com',
      emergencyContacts: [
        {
          name: { forename: 'Jane', surname: 'Smith' },
          relationship: 'Spouse',
          mobileNumber: '07700900001',
          emailAddress: 'jane.smith@example.com',
        },
      ],
    })

    const response = await request(app)
      .get('/details')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect('Content-Type', /html/)
      .expect(200)

    expect(response.text).toContain('Your details')
    expect(response.text).toContain('John Smith')
    expect(response.text).toContain('Johnny')
    expect(response.text).toContain('15 May 1990')
    expect(response.text).toContain('High Street')
    expect(response.text).toContain('London')
    expect(response.text).toContain('SW1A 1AA')
    expect(response.text).toContain('01234567890')
    expect(response.text).toContain('07700900000')
    expect(response.text).toContain('john.smith@example.com')
    expect(response.text).toContain('Jane Smith')
    expect(response.text).toContain('Spouse')
    expect(response.text).toContain('07700900001')
    expect(peopleOnProbationService.getPersonalDetails).toHaveBeenCalledWith('X123456')
  })

  it('should render without emergency contacts when none are present', async () => {
    peopleOnProbationService.getPersonalDetails.mockResolvedValue({
      name: { forename: 'John', surname: 'Smith' },
      emergencyContacts: [],
    })

    const response = await request(app)
      .get('/details')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('Your details')
    expect(response.text).toContain('John Smith')
  })

  it('renders an admin preview session exactly like a real citizen session, with the exit-preview banner', async () => {
    peopleOnProbationService.getPersonalDetails.mockResolvedValue({
      name: { forename: 'John', surname: 'Smith' },
      emergencyContacts: [],
    })

    const previewSession = createAuthenticatedUserSession({
      userId: 'admin-preview:admin1',
      adminPreviewSubject: {
        personReference: 'X123456',
        startedAt: '2026-01-01T00:00:00Z',
      },
      previewedByAdmin: 'admin1',
    })
    await saveAuthenticatedUserSession(previewSession)

    const response = await request(app)
      .get('/details')
      .set('Cookie', `${appSessionCookieName}=${previewSession.id}`)
      .expect(200)

    expect(response.text).toContain('John Smith')
    expect(response.text).toContain('You are previewing this account as CRN')
    expect(response.text).toContain('X123456')
    expect(response.text).toContain('Exit preview')
    expect(peopleOnProbationService.getPersonalDetails).toHaveBeenCalledWith('X123456')

    // The banner "Exit preview" ends just the preview (POST, stays signed
    // in to HMPPS Auth); the nav "Sign out" does a full HMPPS Auth logout
    // instead of the citizen /sign-out route (there is no One Login session
    // to end for an admin).
    expect(response.text).toContain('action="/admin/preview/end"')
    expect(response.text).toContain('href="/admin/sign-out"')
    expect(response.text).not.toContain('href="/sign-out"')
  })

  it('should pass errors to the next error handler', async () => {
    peopleOnProbationService.getPersonalDetails.mockRejectedValue(new Error('API failure'))

    await request(app)
      .get('/details')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(500)
  })
})
