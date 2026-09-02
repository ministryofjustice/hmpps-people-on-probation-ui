import type { Express } from 'express'
import request from 'supertest'
import { appWithAllRoutes, createAppSessionCookie } from './testutils/appSetup'
import { appSessionCookieName } from '../auth/cookies'
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

describe('GET /probation-officer', () => {
  it('should redirect unauthenticated users to the sign-in page with returnTo', async () => {
    await request(app).get('/probation-officer').expect(302).expect('Location', '/?returnTo=%2Fprobation-officer')
  })

  it('should redirect users with an expired session to the session timeout page', async () => {
    await request(app)
      .get('/probation-officer')
      .set('Cookie', `${appSessionCookieName}=expired-session-id`)
      .expect(302)
      .expect('Location', '/session-timeout')
  })

  it('should redirect authenticated users without a person reference to auth error', async () => {
    await request(app)
      .get('/probation-officer')
      .set('Cookie', await createAppSessionCookie())
      .expect(302)
      .expect('Location', '/autherror')
  })

  it('should render the probation officer name, phone number and office address', async () => {
    peopleOnProbationService.getPersonalDetails.mockResolvedValue({
      name: { forename: 'John', surname: 'Smith' },
      emergencyContacts: [],
      practitioner: {
        name: { forename: 'Sarah', surname: 'Jones' },
        team: {
          telephoneNumber: '01234567890',
          officeAddresses: [
            {
              houseNumber: '10',
              street: 'Probation Lane',
              town: 'Manchester',
              postcode: 'M1 1AA',
            },
          ],
        },
      },
    })

    const response = await request(app)
      .get('/probation-officer')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect('Content-Type', /html/)
      .expect(200)

    expect(response.text).toContain('Probation officer details')
    expect(response.text).toContain('Sarah Jones')
    expect(response.text).toContain('01234567890')
    expect(response.text).toContain('Probation Lane')
    expect(response.text).toContain('Manchester')
    expect(response.text).toContain('M1 1AA')
    expect(peopleOnProbationService.getPersonalDetails).toHaveBeenCalledWith('X123456')
  })

  it('should render without officer details when no practitioner is assigned', async () => {
    peopleOnProbationService.getPersonalDetails.mockResolvedValue({
      name: { forename: 'John', surname: 'Smith' },
      emergencyContacts: [],
      practitioner: null,
    })

    const response = await request(app)
      .get('/probation-officer')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('Probation officer details')
    expect(response.text).not.toContain('Sarah Jones')
  })

  it('should render without officer details when the practitioner is unallocated', async () => {
    peopleOnProbationService.getPersonalDetails.mockResolvedValue({
      name: { forename: 'John', surname: 'Smith' },
      emergencyContacts: [],
      practitioner: {
        name: { forename: 'Unallocated', surname: '' },
      },
    })

    const response = await request(app)
      .get('/probation-officer')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('No probation officer details are available at this time.')
    expect(response.text).not.toContain('Unallocated')
    expect(response.text).not.toContain('<dt class="pop-summary-card__key">Name</dt>')
  })

  it('should render the office location link when officeLocationUrl is present', async () => {
    peopleOnProbationService.getPersonalDetails.mockResolvedValue({
      name: { forename: 'John', surname: 'Smith' },
      emergencyContacts: [],
      practitioner: {
        name: { forename: 'Sarah', surname: 'Jones' },
        team: {
          telephoneNumber: '01234567890',
          officeAddresses: [
            {
              houseNumber: '10',
              street: 'Probation Lane',
              town: 'Manchester',
              postcode: 'M1 1AA',
            },
          ],
        },
        officeLocationUrl: 'https://www.gov.uk/guidance/havering-pioneer-house',
      },
    })

    const response = await request(app)
      .get('/probation-officer')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('https://www.gov.uk/guidance/havering-pioneer-house')
    expect(response.text).toContain('Office location')
  })

  it('should not render an office location link when officeLocationUrl is absent', async () => {
    peopleOnProbationService.getPersonalDetails.mockResolvedValue({
      name: { forename: 'John', surname: 'Smith' },
      emergencyContacts: [],
      practitioner: {
        name: { forename: 'Sarah', surname: 'Jones' },
        team: {
          telephoneNumber: '01234567890',
          officeAddresses: [
            {
              houseNumber: '10',
              street: 'Probation Lane',
              town: 'Manchester',
              postcode: 'M1 1AA',
            },
          ],
        },
      },
    })

    const response = await request(app)
      .get('/probation-officer')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).not.toContain('Office location')
  })

  it('should render without office address when the practitioner has no team address', async () => {
    peopleOnProbationService.getPersonalDetails.mockResolvedValue({
      name: { forename: 'John', surname: 'Smith' },
      emergencyContacts: [],
      practitioner: {
        name: { forename: 'Sarah', surname: 'Jones' },
        team: { telephoneNumber: '01234567890', officeAddresses: [] },
      },
    })

    const response = await request(app)
      .get('/probation-officer')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('Sarah Jones')
    expect(response.text).toContain('01234567890')
  })

  it('should pass errors to the next error handler', async () => {
    peopleOnProbationService.getPersonalDetails.mockRejectedValue(new Error('API failure'))

    await request(app)
      .get('/probation-officer')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(500)
  })
})
