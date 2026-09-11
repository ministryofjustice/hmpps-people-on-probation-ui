import express, { Express } from 'express'
import request from 'supertest'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import adminDocumentsRoutes from './adminDocuments'
import nunjucksSetup from '../utils/nunjucksSetup'
import setUpWebSession from '../middleware/setUpWebSession'
import AuditService from '../services/auditService'
import config from '../config'
import type { Services } from '../services'

jest.mock('../services/auditService')

function buildApp({ signedIn = true }: { signedIn?: boolean } = {}) {
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
    next()
  })

  const auditService = new AuditService() as jest.Mocked<AuditService>
  const getPersonalDetailsMock = jest.fn()
  const presignDocumentUploadMock = jest.fn()
  const createDocumentMock = jest.fn()

  const peopleOnProbationService = {
    getPersonalDetails: getPersonalDetailsMock,
    presignDocumentUpload: presignDocumentUploadMock,
    createDocument: createDocumentMock,
  } as unknown as Services['peopleOnProbationService']

  app.use('/admin/documents', adminDocumentsRoutes({ peopleOnProbationService, auditService } as never))

  return { app: app as Express, auditService, getPersonalDetailsMock, presignDocumentUploadMock, createDocumentMock }
}

describe('GET /admin/documents/upload', () => {
  it('renders the CRN search form', async () => {
    const { app } = buildApp()

    const response = await request(app).get('/admin/documents/upload').expect(200)

    expect(response.text).toContain('Upload a document')
  })

  it('redirects to sign-in when there is no admin session', async () => {
    const { app } = buildApp({ signedIn: false })

    await request(app).get('/admin/documents/upload').expect(302).expect('Location', '/admin/sign-in')
  })
})

describe('POST /admin/documents/upload', () => {
  it('shows a validation error for an invalid CRN format', async () => {
    const { app, getPersonalDetailsMock } = buildApp()

    const response = await request(app).post('/admin/documents/upload').send({ crn: 'not-a-crn' }).expect(200)

    expect(response.text).toContain('Enter a CRN in the correct format')
    expect(getPersonalDetailsMock).not.toHaveBeenCalled()
  })

  it('shows a not-found error when the CRN does not exist', async () => {
    const { app, getPersonalDetailsMock } = buildApp()
    getPersonalDetailsMock.mockRejectedValue({ responseStatus: 404 })

    const response = await request(app).post('/admin/documents/upload').send({ crn: 'X123456' }).expect(200)

    expect(response.text).toContain('No probation account found')
  })

  it('renders the upload screen for a valid CRN, showing the person name for cross-checking', async () => {
    const { app, getPersonalDetailsMock } = buildApp()
    getPersonalDetailsMock.mockResolvedValue({ name: { forename: 'Jane', surname: 'Doe' } })

    const response = await request(app).post('/admin/documents/upload').send({ crn: 'X123456' }).expect(200)

    expect(response.text).toContain('X123456')
    expect(response.text).toContain('Jane Doe')
    expect(response.text).toContain('data-document-upload-input')
    expect(response.text).toContain('data-crn="X123456"')
    expect(response.text).toContain('id="document-type"')
    expect(response.text).toContain('Court order')
  })
})

describe('POST /admin/documents/upload/presign', () => {
  it('returns 400 for an invalid CRN', async () => {
    const { app, presignDocumentUploadMock } = buildApp()

    await request(app).post('/admin/documents/upload/presign').send({ crn: 'not-a-crn' }).expect(400)

    expect(presignDocumentUploadMock).not.toHaveBeenCalled()
  })

  it('returns 400 for a missing or unrecognised document type', async () => {
    const { app, presignDocumentUploadMock } = buildApp()

    await request(app).post('/admin/documents/upload/presign').send({ crn: 'X123456' }).expect(400)
    await request(app)
      .post('/admin/documents/upload/presign')
      .send({ crn: 'X123456', documentType: 'NOT_A_REAL_TYPE' })
      .expect(400)

    expect(presignDocumentUploadMock).not.toHaveBeenCalled()
  })

  it('returns the presigned upload URL for a valid CRN and document type', async () => {
    const { app, presignDocumentUploadMock } = buildApp()
    presignDocumentUploadMock.mockResolvedValue({
      s3Key: 'documents/X123456/doc-1.pdf',
      uploadUrl: 'https://example-bucket.s3.eu-west-2.amazonaws.com/doc-1.pdf?signature=abc',
      contentType: 'application/pdf',
    })

    const response = await request(app)
      .post('/admin/documents/upload/presign')
      .send({ crn: 'X123456', documentType: 'COURT_ORDER' })
      .expect(200)

    expect(response.body).toEqual({
      s3Key: 'documents/X123456/doc-1.pdf',
      uploadUrl: 'https://example-bucket.s3.eu-west-2.amazonaws.com/doc-1.pdf?signature=abc',
      contentType: 'application/pdf',
    })
    expect(presignDocumentUploadMock).toHaveBeenCalledWith('X123456', 'COURT_ORDER')
  })
})

describe('POST /admin/documents/upload/confirm', () => {
  it('returns 400 when name, s3Key or document type is missing', async () => {
    const { app, createDocumentMock } = buildApp()

    await request(app).post('/admin/documents/upload/confirm').send({ crn: 'X123456' }).expect(400)
    await request(app)
      .post('/admin/documents/upload/confirm')
      .send({ crn: 'X123456', name: 'Your Court Order', s3Key: 'documents/X123456/doc-1.pdf' })
      .expect(400)

    expect(createDocumentMock).not.toHaveBeenCalled()
  })

  it('returns 400 when the name is longer than 255 characters', async () => {
    const { app, createDocumentMock } = buildApp()

    await request(app)
      .post('/admin/documents/upload/confirm')
      .send({
        crn: 'X123456',
        name: 'a'.repeat(256),
        s3Key: 'documents/X123456/doc-1.pdf',
        documentType: 'COURT_ORDER',
      })
      .expect(400)

    expect(createDocumentMock).not.toHaveBeenCalled()
  })

  it('returns 400 when the name contains characters outside letters, numbers, spaces and underscores', async () => {
    const { app, createDocumentMock } = buildApp()

    await request(app)
      .post('/admin/documents/upload/confirm')
      .send({
        crn: 'X123456',
        name: '<script>alert(1)</script>',
        s3Key: 'documents/X123456/doc-1.pdf',
        documentType: 'COURT_ORDER',
      })
      .expect(400)

    expect(createDocumentMock).not.toHaveBeenCalled()
  })

  it('creates the document and audits the upload', async () => {
    const { app, createDocumentMock, auditService } = buildApp()
    createDocumentMock.mockResolvedValue({
      id: 'doc-1',
      name: 'Your Court Order',
      documentType: 'COURT_ORDER',
      uploadedAt: '2026-01-01T00:00:00Z',
    })

    const response = await request(app)
      .post('/admin/documents/upload/confirm')
      .send({
        crn: 'X123456',
        name: 'Your Court Order',
        s3Key: 'documents/X123456/doc-1.pdf',
        documentType: 'COURT_ORDER',
      })
      .expect(200)

    expect(response.body).toEqual({
      id: 'doc-1',
      name: 'Your Court Order',
      documentType: 'COURT_ORDER',
      uploadedAt: '2026-01-01T00:00:00Z',
    })
    expect(createDocumentMock).toHaveBeenCalledWith('X123456', {
      name: 'Your Court Order',
      s3Key: 'documents/X123456/doc-1.pdf',
      documentType: 'COURT_ORDER',
    })
    expect(auditService.logAdminDocumentUploaded).toHaveBeenCalledWith(
      expect.objectContaining({ who: 'admin1', subjectId: 'X123456' }),
    )
  })
})

describe('GET /admin/documents/upload/confirmed', () => {
  it('renders the confirmation page', async () => {
    const { app } = buildApp()

    const response = await request(app).get('/admin/documents/upload/confirmed').expect(200)

    expect(response.text).toContain('Document uploaded')
  })
})
