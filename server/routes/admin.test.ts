import express, { Express } from 'express'
import request from 'supertest'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import adminRoutes from './admin'
import nunjucksSetup from '../utils/nunjucksSetup'
import setUpWebSession from '../middleware/setUpWebSession'
import { getPeopleOnProbationService } from '../services/peopleOnProbationService'
import { appSessionCookieName } from '../auth/cookies'
import { getAuthenticatedUserSession } from '../auth/sessionStore'
import AuditService from '../services/auditService'
import config from '../config'
import logger from '../../logger'

jest.mock('../../logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}))

jest.mock('../services/peopleOnProbationService', () => ({
  getPeopleOnProbationService: jest.fn(),
}))

jest.mock('../services/auditService')

const mockedGetPeopleOnProbationService = getPeopleOnProbationService as jest.MockedFunction<
  typeof getPeopleOnProbationService
>

function buildApp({
  signedIn = true,
  staleCitizenSession = false,
}: { signedIn?: boolean; staleCitizenSession?: boolean } = {}) {
  // These tests exercise the /admin business logic, not which gate sits in
  // front of it (see requireAdminRole.test.ts / requireAdminUsername.test.ts
  // for that) — pin the role-based gate regardless of the
  // adminRestrictByUsername default.
  config.adminRestrictByUsername = false
  config.adminAuthorisedRoles = ['ADMIN_PREVIEW']

  const app = express()
  app.set('view engine', 'njk')
  nunjucksSetup(app)
  app.use(cookieParser())
  app.use(setUpWebSession())
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))
  app.use((req, res, next) => {
    req.id = randomUUID()
    next()
  })
  app.use((req, res, next) => {
    if (signedIn) {
      const token = jwt.sign({ authorities: ['ROLE_ADMIN_PREVIEW'] }, 'secret', { expiresIn: '1h' })
      res.locals.adminUser = { username: 'admin1', authSource: 'auth', token }
    }
    if (staleCitizenSession) {
      // Simulates a leftover citizen app session cookie from unrelated
      // browsing in the same browser, unrelated to this admin's preview.
      res.locals.user = {
        registeredUserDetails: {
          id: 'registered-user-id',
          personReference: 'Z999999',
          status: 'ACTIVE',
          createdAt: '2026-01-01T00:00:00Z',
        },
      } as never
    }
    next()
  })

  const auditService = new AuditService() as jest.Mocked<AuditService>
  const getPersonalDetailsMock = jest.fn()

  mockedGetPeopleOnProbationService.mockReturnValue({
    getPersonalDetails: getPersonalDetailsMock,
  } as unknown as ReturnType<typeof getPeopleOnProbationService>)

  app.use('/admin', adminRoutes({ peopleOnProbationService: getPeopleOnProbationService(), auditService } as never))

  return { app: app as Express, auditService, getPersonalDetailsMock }
}

describe('GET /admin/search', () => {
  it('renders the search form for a signed-in admin', async () => {
    const { app } = buildApp()

    const response = await request(app).get('/admin/search').expect(200)

    expect(response.text).toContain('Preview a probation account')
    // Visible even with no active preview - res.locals.user (citizen nav)
    // isn't set yet, so the header must fall back to res.locals.adminUser.
    expect(response.text).toContain('href="/admin/sign-out"')
  })

  it('redirects to sign-in when there is no admin session', async () => {
    const { app } = buildApp({ signedIn: false })

    await request(app).get('/admin/search').expect(302).expect('Location', '/admin/sign-in')
  })

  it('shows the admin-only nav, not the full citizen nav, when a stale unrelated citizen session cookie is present', async () => {
    const { app } = buildApp({ staleCitizenSession: true })

    const response = await request(app).get('/admin/search').expect(200)

    expect(response.text).toContain('href="/admin/sign-out"')
    expect(response.text).not.toContain('Appointments and activities')
  })
})

describe('POST /admin/search', () => {
  it('shows a validation error for an invalid CRN format', async () => {
    const { app, getPersonalDetailsMock } = buildApp()

    const response = await request(app).post('/admin/search').send({ crn: 'not-a-crn' }).expect(200)

    expect(response.text).toContain('Enter a CRN in the correct format')
    expect(getPersonalDetailsMock).not.toHaveBeenCalled()
  })

  it('audits an invalid-format search attempt', async () => {
    const { app, auditService } = buildApp()

    await request(app).post('/admin/search').send({ crn: 'not-a-crn' }).expect(200)

    expect(auditService.logAdminPreviewSearchAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ who: 'admin1', details: { outcome: 'invalid-format' } }),
    )
  })

  it('shows a not-found error when the CRN does not exist', async () => {
    const { app, getPersonalDetailsMock, auditService } = buildApp()
    getPersonalDetailsMock.mockRejectedValue({ responseStatus: 404 })

    const response = await request(app).post('/admin/search').send({ crn: 'X123456' }).expect(200)

    expect(response.text).toContain('No probation account found')
    expect(auditService.logAdminPreviewSearchAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ who: 'admin1', subjectId: 'X123456', details: { outcome: 'not-found' } }),
    )
  })

  it('starts a preview session and sets the app session cookie when the CRN is found', async () => {
    const { app, getPersonalDetailsMock, auditService } = buildApp()
    getPersonalDetailsMock.mockResolvedValue({ name: { forename: 'Jane', surname: 'Doe' } })

    const response = await request(app).post('/admin/search').send({ crn: 'X123456' }).expect(302)

    expect(response.headers.location).toBe('/')
    const setCookieHeader = response.headers['set-cookie'] as unknown as string[]
    const appSessionCookie = setCookieHeader.find(cookie => cookie.startsWith(appSessionCookieName))
    expect(appSessionCookie).toBeDefined()

    const sessionId = appSessionCookie.split('=')[1].split(';')[0]
    const session = await getAuthenticatedUserSession(sessionId)
    expect(session?.adminPreviewSubject?.personReference).toBe('X123456')
    expect(session?.previewedByAdmin).toBe('admin1')

    expect(auditService.logAdminPreviewSearchAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ who: 'admin1', subjectId: 'X123456', details: { outcome: 'found' } }),
    )
    expect(auditService.logAdminPreviewStarted).toHaveBeenCalledWith(
      expect.objectContaining({ who: 'admin1', subjectId: 'X123456' }),
    )
  })

  it('logs a warning but does not throw when the audit call fails', async () => {
    const { app, getPersonalDetailsMock, auditService } = buildApp()
    getPersonalDetailsMock.mockResolvedValue({ name: { forename: 'Jane', surname: 'Doe' } })
    auditService.logAdminPreviewStarted.mockRejectedValue(new Error('audit down'))

    await request(app).post('/admin/search').send({ crn: 'X123456' }).expect(302)

    expect(logger.warn).toHaveBeenCalled()
  })
})

describe('POST /admin/preview/end', () => {
  it('clears the preview session and redirects to the search page', async () => {
    const { app, getPersonalDetailsMock, auditService } = buildApp()
    getPersonalDetailsMock.mockResolvedValue({ name: { forename: 'Jane', surname: 'Doe' } })

    const startResponse = await request(app).post('/admin/search').send({ crn: 'X123456' }).expect(302)
    const setCookieHeader = startResponse.headers['set-cookie'] as unknown as string[]
    const appSessionCookie = setCookieHeader.find(cookie => cookie.startsWith(appSessionCookieName))
    const sessionId = appSessionCookie.split('=')[1].split(';')[0]

    const endResponse = await request(app).post('/admin/preview/end').set('Cookie', appSessionCookie).expect(302)

    expect(endResponse.headers.location).toBe('/admin/search')
    expect(await getAuthenticatedUserSession(sessionId)).toBeNull()
    expect(auditService.logAdminPreviewEnded).toHaveBeenCalledWith(
      expect.objectContaining({ who: 'admin1', subjectId: 'X123456' }),
    )
  })

  it('does nothing and just redirects when there is no active preview session', async () => {
    const { app, auditService } = buildApp()

    const response = await request(app).post('/admin/preview/end').expect(302)

    expect(response.headers.location).toBe('/admin/search')
    expect(auditService.logAdminPreviewEnded).not.toHaveBeenCalled()
  })
})
