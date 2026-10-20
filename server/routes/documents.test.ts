import express, { Express } from 'express'
import request from 'supertest'
import cookieParser from 'cookie-parser'
import { randomUUID } from 'crypto'
import documentsRoutes from './documents'
import nunjucksSetup from '../utils/nunjucksSetup'
import setUpWebSession from '../middleware/setUpWebSession'
import type { Services } from '../services'

function buildApp({
  signedIn = true,
  personReference = 'X123456',
}: { signedIn?: boolean; personReference?: string | null } = {}) {
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
      res.locals.user = {
        registeredUserDetails: {
          id: 'registered-user-id',
          ...(personReference ? { personReference } : {}),
          status: 'ACTIVE',
          createdAt: '2026-01-01T00:00:00Z',
        },
      } as never
    }
    next()
  })

  const getDocumentsMock = jest.fn()
  const getDocumentMock = jest.fn()

  const peopleOnProbationService = {
    getDocuments: getDocumentsMock,
    getDocument: getDocumentMock,
  } as unknown as Services['peopleOnProbationService']

  app.use('/documents', documentsRoutes({ peopleOnProbationService } as never))

  app.use((req, res) => {
    res.status(404).send('Not found')
  })

  return { app: app as Express, getDocumentsMock, getDocumentMock }
}

describe('GET /documents', () => {
  it('redirects to sign-in when there is no session', async () => {
    const { app } = buildApp({ signedIn: false })

    await request(app).get('/documents').expect(302).expect('Location', '/?returnTo=%2Fdocuments')
  })

  it('renders each document as a card linking to its view page', async () => {
    const { app, getDocumentsMock } = buildApp()
    getDocumentsMock.mockResolvedValue({
      documents: [
        { id: 'doc-1', name: 'Your Court Order', documentType: 'COURT_ORDER', uploadedAt: '2026-01-01T00:00:00Z' },
      ],
    })

    const response = await request(app).get('/documents').expect(200)

    expect(response.text).toContain('Documents')
    expect(response.text).toContain('href="/documents/doc-1"')
    expect(response.text).toContain('Your court order')
    expect(getDocumentsMock).toHaveBeenCalledWith('X123456')
  })

  it('shows an empty state when there are no documents', async () => {
    const { app, getDocumentsMock } = buildApp()
    getDocumentsMock.mockResolvedValue({ documents: [] })

    const response = await request(app).get('/documents').expect(200)

    expect(response.text).toContain('You do not have any documents yet.')
  })
})

describe('GET /documents/:id', () => {
  it('shows the sensitive information interruption page before the document', async () => {
    const { app, getDocumentMock } = buildApp()

    const response = await request(app).get('/documents/doc-1').expect(200)

    expect(response.text).toContain('Sensitive information – Check your probation account – GOV.UK')
    expect(response.text).toContain('moj-interruption-card')
    expect(response.text).toContain('<h1 class="moj-interruption-card__heading">Sensitive information</h1>')
    expect(response.text).toContain('This document may include information about:')
    expect(response.text).toContain('<li>your offence</li>')
    expect(response.text).toContain('<li>what you need to do while on probation</li>')
    expect(response.text).toContain('<li>your personal details or circumstances</li>')
    expect(response.text).toContain(
      'You might want to look at this document in a safe place where others will not see it.',
    )
    expect(response.text).toMatch(/href="\/documents\/doc-1\/view"[^>]*>\s*Continue to view document/)
    expect(response.text).toContain('href="/documents">Go back to documents list</a>')
    expect(getDocumentMock).not.toHaveBeenCalled()
  })

  it('encodes the document id in the continue link', async () => {
    const { app } = buildApp()

    const response = await request(app).get('/documents/doc%201').expect(200)

    expect(response.text).toContain('href="/documents/doc%201/view"')
  })

  it('redirects to auth error when signed in without a person reference', async () => {
    const { app } = buildApp({ personReference: null })

    const response = await request(app).get('/documents/doc-1')

    expect(response.status).toBe(302)
    expect(response.headers.location).toBe('/autherror')
  })

  it('redirects to sign in when signed out', async () => {
    const { app } = buildApp({ signedIn: false })

    const response = await request(app).get('/documents/doc-1')

    expect(response.status).toBe(302)
    expect(response.headers.location).toBe('/?returnTo=%2Fdocuments%2Fdoc-1')
  })
})

describe('GET /documents/:id/view', () => {
  it('renders the document viewer with the presigned view URL', async () => {
    const { app, getDocumentMock } = buildApp()
    getDocumentMock.mockResolvedValue({
      id: 'doc-1',
      name: 'Your Court Order',
      documentType: 'COURT_ORDER',
      uploadedAt: '2026-01-01T00:00:00Z',
      viewUrl: 'https://example-bucket.s3.eu-west-2.amazonaws.com/doc-1.pdf?signature=abc',
    })

    const response = await request(app).get('/documents/doc-1/view').expect(200)

    expect(response.text).toContain('Your court order')
    expect(response.text).toContain('data-document-view-url=')
    expect(response.text).toContain('example-bucket.s3.eu-west-2.amazonaws.com/doc-1.pdf')
    expect(getDocumentMock).toHaveBeenCalledWith('X123456', 'doc-1')
  })

  it('returns 404 when the document does not exist or is not owned by this CRN', async () => {
    const { app, getDocumentMock } = buildApp()
    getDocumentMock.mockRejectedValue({ responseStatus: 404 })

    await request(app).get('/documents/does-not-exist/view').expect(404)
  })
})
