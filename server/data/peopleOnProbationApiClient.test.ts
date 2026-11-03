import nock from 'nock'
import type { AuthenticationClient } from '@ministryofjustice/hmpps-auth-clients'
import PeopleOnProbationApiClient, {
  type LicenceResponse,
  type LicenceSummaryResponse,
} from './peopleOnProbationApiClient'
import config from '../config'

describe('PeopleOnProbationApiClient licences', () => {
  let fakeApi: nock.Scope
  let client: PeopleOnProbationApiClient

  beforeEach(() => {
    fakeApi = nock(config.apis.peopleOnProbationApi.url, {
      reqheaders: { authorization: 'Bearer system-token' },
    })
    const authenticationClient = {
      getToken: jest.fn().mockResolvedValue('system-token'),
    } as unknown as AuthenticationClient
    client = new PeopleOnProbationApiClient(authenticationClient)
  })

  afterEach(() => {
    nock.cleanAll()
  })

  it('gets licence summaries for a CRN', async () => {
    const summaries: LicenceSummaryResponse[] = [
      { id: 1440, statusCode: 'ACTIVE', bookingId: 1239469, sentenceStartDate: '2026-09-16' },
    ]
    fakeApi.get('/v1/person/Y057365/licences').reply(200, summaries)

    await expect(client.getLicences('Y057365')).resolves.toEqual(summaries)
    expect(fakeApi.isDone()).toBe(true)
  })

  it('gets a licence with its conditions', async () => {
    const licence: LicenceResponse = {
      id: 1440,
      statusCode: 'ACTIVE',
      conditions: {
        AP: { standard: [{ code: 'abc', text: 'Be of good behaviour' }], additional: [], bespoke: [] },
        PSS: { standard: [], additional: [], bespoke: [] },
      },
    }
    fakeApi.get('/v1/person/Y057365/licences/1440').reply(200, licence)

    await expect(client.getLicence('Y057365', 1440)).resolves.toEqual(licence)
    expect(fakeApi.isDone()).toBe(true)
  })
})
