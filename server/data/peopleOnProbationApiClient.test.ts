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

  it('gets a home detention curfew licence, with its curfew address and times and the new condition fields', async () => {
    const licence: LicenceResponse = {
      id: 1444,
      kind: 'HDC',
      statusCode: 'ACTIVE',
      curfewAddress: {
        uprn: null,
        firstLine: '18 Scott way',
        secondLine: 'Prunus walk',
        townOrCity: 'Swindon',
        county: null,
        postcode: 'SN59AU',
      },
      firstNightCurfewTimes: { fromDay: null, fromTime: '15:00:00', untilDay: null, untilTime: '07:00:00' },
      curfewTimes: [{ fromDay: 'MONDAY', fromTime: '19:00:00', untilDay: 'TUESDAY', untilTime: '07:00:00' }],
      conditions: {
        AP: {
          standard: [],
          additional: [
            {
              id: 1,
              type: 'CURFEW',
              code: '0a370862-5426-49c1-b6d4-3d074d78a81a',
              curfewTimes: [{ startTime: '19:00', endTime: '07:00' }],
              restrictions: [],
            },
            {
              id: 2,
              type: 'ELECTRONIC_MONITORING_WITH_RESTRICTIONS',
              code: '524f2fd6-ad53-47dd-8edc-2161d3dd2ed4',
              endDate: '2027-03-05',
              restrictions: [],
            },
            { id: 3, type: 'IMAGE_UPLOAD', description: 'Leeds city centre', hasImageUpload: true, restrictions: [] },
          ],
          bespoke: [],
        },
      },
    }
    fakeApi.get('/v1/person/Y057371/licences/1444').reply(200, licence)

    await expect(client.getLicence('Y057371', 1444)).resolves.toEqual(licence)
    expect(fakeApi.isDone()).toBe(true)
  })

  it('gets a licence condition image with the system token, with its content type', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
    fakeApi
      .get('/v1/person/Y057365/licences/1440/conditions/204/image-upload')
      .reply(200, png, { 'Content-Type': 'image/png' })

    await expect(client.getLicenceConditionImage('Y057365', 1440, 204)).resolves.toEqual({
      body: png,
      contentType: 'image/png',
    })
    expect(fakeApi.isDone()).toBe(true)
  })

  it('rejects with the API status when there is no image', async () => {
    fakeApi.get('/v1/person/Y057365/licences/1440/conditions/204/image-upload').reply(404, { status: 404 })

    await expect(client.getLicenceConditionImage('Y057365', 1440, 204)).rejects.toMatchObject({ responseStatus: 404 })
  })
})
