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

  it('should render the probation officer name and phone number, and the office phone number and address', async () => {
    peopleOnProbationService.getPersonalDetails.mockResolvedValue({
      name: { forename: 'John', surname: 'Smith' },
      emergencyContacts: [],
      practitioner: {
        name: { forename: 'Sarah', surname: 'Jones' },
        team: {
          telephoneNumber: '01234567890',
          officeAddresses: [],
        },
        officePhoneNumber: '01708123456',
        officeAddress: {
          street: '27-35 New Road',
          town: 'Chatham',
          county: 'Kent',
          postcode: 'ME4 4QR',
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
    expect(response.text).toContain('<dt class="pop-summary-card__key">Officer phone number</dt>')
    expect(response.text).toContain('01234567890')
    expect(response.text).toContain('<dt class="pop-summary-card__key">Phone number</dt>')
    expect(response.text).toContain('01708123456')
    expect(response.text).toContain('27-35 New Road')
    expect(response.text).toContain('Chatham')
    expect(response.text).toContain('Kent')
    expect(response.text).toContain('ME4 4QR')
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

  it('should still render the office location link when the practitioner is unallocated but officeLocationUrl and officeName are present', async () => {
    peopleOnProbationService.getPersonalDetails.mockResolvedValue({
      name: { forename: 'John', surname: 'Smith' },
      emergencyContacts: [],
      practitioner: {
        name: { forename: 'Unallocated', surname: '' },
        officeLocationUrl: 'https://www.gov.uk/guidance/havering-pioneer-house',
        officeName: 'Havering Pioneer House',
      },
    })

    const response = await request(app)
      .get('/probation-officer')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).not.toContain('No probation officer details are available at this time.')
    expect(response.text).not.toContain('Unallocated')
    expect(response.text).toContain('https://www.gov.uk/guidance/havering-pioneer-house')
    expect(response.text).toContain('Havering Pioneer House')
    expect(response.text).toContain('Learn more about')
  })

  it('should render the office location link, using officeName as the link text, when officeLocationUrl and officeName are present', async () => {
    peopleOnProbationService.getPersonalDetails.mockResolvedValue({
      name: { forename: 'John', surname: 'Smith' },
      emergencyContacts: [],
      practitioner: {
        name: { forename: 'Sarah', surname: 'Jones' },
        team: {
          telephoneNumber: '01234567890',
          officeAddresses: [],
        },
        officeLocationUrl: 'https://www.gov.uk/guidance/havering-pioneer-house',
        officeName: 'Havering Pioneer House',
      },
    })

    const response = await request(app)
      .get('/probation-officer')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('https://www.gov.uk/guidance/havering-pioneer-house')
    expect(response.text).toContain('Learn more about')
    expect(response.text).toContain('Havering Pioneer House')
  })

  it('should not render an office location link when officeLocationUrl is absent', async () => {
    peopleOnProbationService.getPersonalDetails.mockResolvedValue({
      name: { forename: 'John', surname: 'Smith' },
      emergencyContacts: [],
      practitioner: {
        name: { forename: 'Sarah', surname: 'Jones' },
        team: { telephoneNumber: '01234567890', officeAddresses: [] },
        officeName: 'Havering Pioneer House',
      },
    })

    const response = await request(app)
      .get('/probation-officer')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).not.toContain('Learn more about')
    expect(response.text).not.toContain('Havering Pioneer House')
  })

  it('should not render an office location link when officeName is absent', async () => {
    peopleOnProbationService.getPersonalDetails.mockResolvedValue({
      name: { forename: 'John', surname: 'Smith' },
      emergencyContacts: [],
      practitioner: {
        name: { forename: 'Sarah', surname: 'Jones' },
        team: { telephoneNumber: '01234567890', officeAddresses: [] },
        officeLocationUrl: 'https://www.gov.uk/guidance/havering-pioneer-house',
      },
    })

    const response = await request(app)
      .get('/probation-officer')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).not.toContain('Learn more about')
    expect(response.text).not.toContain('https://www.gov.uk/guidance/havering-pioneer-house')
  })

  it('should not render an office location link when officeLocationUrl is unsafe or malformed', async () => {
    peopleOnProbationService.getPersonalDetails.mockResolvedValue({
      name: { forename: 'John', surname: 'Smith' },
      emergencyContacts: [],
      practitioner: {
        name: { forename: 'Sarah', surname: 'Jones' },
        team: { telephoneNumber: '01234567890', officeAddresses: [] },
        officeLocationUrl: `${'java'}script:alert(1)`,
        officeName: 'Havering Pioneer House',
      },
    })

    const response = await request(app)
      .get('/probation-officer')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).not.toContain('Learn more about')
    expect(response.text).not.toContain('script:')
  })

  it('should not render an office location link when officeLocationUrl is null', async () => {
    peopleOnProbationService.getPersonalDetails.mockResolvedValue({
      name: { forename: 'John', surname: 'Smith' },
      emergencyContacts: [],
      practitioner: {
        name: { forename: 'Sarah', surname: 'Jones' },
        team: { telephoneNumber: '01234567890', officeAddresses: [] },
        officeLocationUrl: null,
        officeName: 'Havering Pioneer House',
      },
    })

    const response = await request(app)
      .get('/probation-officer')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).not.toContain('Learn more about')
  })

  it('should not render the office phone number row when officePhoneNumber is absent', async () => {
    peopleOnProbationService.getPersonalDetails.mockResolvedValue({
      name: { forename: 'John', surname: 'Smith' },
      emergencyContacts: [],
      practitioner: {
        name: { forename: 'Sarah', surname: 'Jones' },
        team: { telephoneNumber: '01234567890', officeAddresses: [] },
        officeLocationUrl: 'https://www.gov.uk/guidance/havering-pioneer-house',
        officeName: 'Havering Pioneer House',
      },
    })

    const response = await request(app)
      .get('/probation-officer')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).not.toContain('<dt class="pop-summary-card__key">Phone number</dt>')
  })

  it('should not render the office address block when officeAddress is null', async () => {
    peopleOnProbationService.getPersonalDetails.mockResolvedValue({
      name: { forename: 'John', surname: 'Smith' },
      emergencyContacts: [],
      practitioner: {
        name: { forename: 'Sarah', surname: 'Jones' },
        team: { telephoneNumber: '01234567890', officeAddresses: [] },
        officeAddress: null,
      },
    })

    const response = await request(app)
      .get('/probation-officer')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).not.toContain('<dt class="pop-summary-card__key">Address</dt>')
  })

  it('should skip blank office address lines', async () => {
    peopleOnProbationService.getPersonalDetails.mockResolvedValue({
      name: { forename: 'John', surname: 'Smith' },
      emergencyContacts: [],
      practitioner: {
        name: { forename: 'Sarah', surname: 'Jones' },
        team: { telephoneNumber: '01234567890', officeAddresses: [] },
        officeAddress: {
          street: '27-35 New Road',
          town: '',
          county: undefined,
          postcode: 'ME4 4QR',
        },
      },
    })

    const response = await request(app)
      .get('/probation-officer')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('27-35 New Road')
    expect(response.text).toContain('ME4 4QR')
  })

  it('should render without an officer phone number when the practitioner has no team', async () => {
    peopleOnProbationService.getPersonalDetails.mockResolvedValue({
      name: { forename: 'John', surname: 'Smith' },
      emergencyContacts: [],
      practitioner: {
        name: { forename: 'Sarah', surname: 'Jones' },
      },
    })

    const response = await request(app)
      .get('/probation-officer')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('Sarah Jones')
    expect(response.text).not.toContain('<dt class="pop-summary-card__key">Officer phone number</dt>')
  })

  it('should pass errors to the next error handler', async () => {
    peopleOnProbationService.getPersonalDetails.mockRejectedValue(new Error('API failure'))

    await request(app)
      .get('/probation-officer')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(500)
  })
})
