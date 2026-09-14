import express, { Express } from 'express'
import request from 'supertest'
import cookieParser from 'cookie-parser'
import { randomUUID } from 'crypto'
import documentsRoutes from './documents'
import nunjucksSetup from '../utils/nunjucksSetup'
import setUpWebSession from '../middleware/setUpWebSession'
import type { Services } from '../services'

function buildApp({ signedIn = true }: { signedIn?: boolean } = {}) {
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
          personReference: 'X123456',
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
    expect(response.text).toContain('Your Court Order')
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
  it('renders the document viewer with the presigned view URL', async () => {
    const { app, getDocumentMock } = buildApp()
    getDocumentMock.mockResolvedValue({
      id: 'doc-1',
      name: 'Your Court Order',
      documentType: 'COURT_ORDER',
      uploadedAt: '2026-01-01T00:00:00Z',
      viewUrl: 'https://example-bucket.s3.eu-west-2.amazonaws.com/doc-1.pdf?signature=abc',
    })

    const response = await request(app).get('/documents/doc-1').expect(200)

    expect(response.text).toContain('Your Court Order')
    expect(response.text).toContain('data-document-view-url=')
    expect(response.text).toContain('example-bucket.s3.eu-west-2.amazonaws.com/doc-1.pdf')
    expect(getDocumentMock).toHaveBeenCalledWith('X123456', 'doc-1')
  })

  it('returns 404 when the document does not exist or is not owned by this CRN', async () => {
    const { app, getDocumentMock } = buildApp()
    getDocumentMock.mockRejectedValue({ responseStatus: 404 })

    await request(app).get('/documents/does-not-exist').expect(404)
  })
})
