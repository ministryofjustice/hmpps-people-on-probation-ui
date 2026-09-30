import express from 'express'
import request from 'supertest'
import loadSentenceKind from './loadSentenceKind'
import type { AuthenticatedUserSession } from '../auth/sessionStore'
import type { SentenceResponse } from '../data/peopleOnProbationApiClient'
import { createAuthenticatedUserSession, getAuthenticatedUserSession } from '../auth/sessionStore'

const licenceSentence: SentenceResponse = {
  requirements: [],
  licenceConditions: [{ mainCategory: { code: 'NLC8', description: 'Standard licence conditions' } }],
}
const communityOrderSentence: SentenceResponse = {
  requirements: [{ mainCategory: { code: 'F', description: 'Rehabilitation activity requirement' } }],
  licenceConditions: [],
}

let getSentences: jest.Mock

function testApp(user?: AuthenticatedUserSession) {
  const app = express()
  app.use((_req, res, next) => {
    res.locals.user = user
    next()
  })
  app.use(loadSentenceKind({ peopleOnProbationService: { getSentences } } as never))
  app.get('/', (_req, res) =>
    res.json({ isLicence: res.locals.isLicence, sentenceKind: res.locals.user?.sentenceKind }),
  )
  return app
}

const session = (overrides: Partial<AuthenticatedUserSession> = {}) => ({
  ...createAuthenticatedUserSession({
    userId: 'one-login-subject',
    registeredUserDetails: {
      id: 'id',
      personReference: 'X123456',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00Z',
    },
  }),
  ...overrides,
})

beforeEach(() => {
  getSentences = jest.fn()
})

describe('loadSentenceKind', () => {
  it('flags a licence sentence and caches the kind in the session', async () => {
    getSentences.mockResolvedValue({ sentences: [licenceSentence] })
    const user = session()

    const response = await request(testApp(user)).get('/').expect(200)

    expect(response.body).toEqual({ isLicence: true, sentenceKind: 'LICENCE' })
    expect(getSentences).toHaveBeenCalledWith('X123456')
    expect((await getAuthenticatedUserSession(user.id))?.sentenceKind).toEqual('LICENCE')
  })

  it('does not flag a community order sentence', async () => {
    getSentences.mockResolvedValue({ sentences: [communityOrderSentence] })

    const response = await request(testApp(session())).get('/').expect(200)

    expect(response.body).toEqual({ isLicence: false, sentenceKind: 'COMMUNITY_ORDER' })
  })

  it('caches null when there is no sentence so it is not looked up again', async () => {
    getSentences.mockResolvedValue({ sentences: [] })
    const user = session()

    const response = await request(testApp(user)).get('/').expect(200)

    expect(response.body).toEqual({ isLicence: false, sentenceKind: null })
    expect((await getAuthenticatedUserSession(user.id))?.sentenceKind).toBeNull()
  })

  it('uses the cached kind without calling the API', async () => {
    const response = await request(testApp(session({ sentenceKind: 'LICENCE' })))
      .get('/')
      .expect(200)

    expect(response.body.isLicence).toBe(true)
    expect(getSentences).not.toHaveBeenCalled()
  })

  it('falls back to not licence and leaves the kind uncached when the API fails', async () => {
    getSentences.mockRejectedValue(new Error('API down'))
    const user = session()

    const response = await request(testApp(user)).get('/').expect(200)

    expect(response.body).toEqual({ isLicence: false })
    expect(await getAuthenticatedUserSession(user.id)).toBeNull()
  })

  it('does nothing for a signed-out user', async () => {
    const response = await request(testApp()).get('/').expect(200)

    expect(response.body).toEqual({ isLicence: false })
    expect(getSentences).not.toHaveBeenCalled()
  })
})
