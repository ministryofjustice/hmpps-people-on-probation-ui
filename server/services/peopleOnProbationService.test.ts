import PeopleOnProbationService, { MAX_EXTRA_PAST_APPOINTMENT_PAGES } from './peopleOnProbationService'
import type PeopleOnProbationApiClient from '../data/peopleOnProbationApiClient'

jest.mock('../data/index', () => ({ getAuthenticationClient: jest.fn() }))

const appointments = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, i) => ({ date: `appointment-${offset + i}` }))

const pageOf = (content: unknown[], totalElements: number) => ({
  content,
  page: { size: content.length, number: 0, totalElements, totalPages: 1 },
})

describe('PeopleOnProbationService.getAllPastAppointments', () => {
  let getPastAppointments: jest.Mock
  let service: PeopleOnProbationService

  beforeEach(() => {
    getPastAppointments = jest.fn()
    service = new PeopleOnProbationService({ getPastAppointments } as unknown as PeopleOnProbationApiClient)
  })

  it('makes one call when everything fits in the first page', async () => {
    getPastAppointments.mockResolvedValueOnce(pageOf(appointments(16), 16))

    const result = await service.getAllPastAppointments('X123456')

    expect(result).toHaveLength(16)
    expect(getPastAppointments).toHaveBeenCalledTimes(1)
    expect(getPastAppointments).toHaveBeenCalledWith('X123456', 0, 100)
  })

  it('makes a second call for exactly the total when the first page is not enough', async () => {
    getPastAppointments
      .mockResolvedValueOnce(pageOf(appointments(100), 250))
      .mockResolvedValueOnce(pageOf(appointments(250), 250))

    const result = await service.getAllPastAppointments('X123456')

    expect(result).toHaveLength(250)
    expect(getPastAppointments).toHaveBeenCalledTimes(2)
    expect(getPastAppointments).toHaveBeenLastCalledWith('X123456', 0, 250)
  })

  it('fetches the remaining pages in parallel when the API caps the page size', async () => {
    getPastAppointments
      .mockResolvedValueOnce(pageOf(appointments(100), 450))
      .mockResolvedValueOnce(pageOf(appointments(200), 450))
      .mockImplementation((_crn, page: number, size: number) =>
        Promise.resolve(pageOf(appointments(Math.min(size, 450 - page * size), page * size), 450)),
      )

    const result = await service.getAllPastAppointments('X123456')

    expect(result).toHaveLength(450)
    expect(new Set(result.map(a => a.date)).size).toBe(450)
    expect(getPastAppointments).toHaveBeenCalledTimes(4)
    expect(getPastAppointments).toHaveBeenCalledWith('X123456', 1, 200)
    expect(getPastAppointments).toHaveBeenCalledWith('X123456', 2, 200)
  })

  it('fails without fetching any more pages when the API caps the page size too low', async () => {
    getPastAppointments
      .mockResolvedValueOnce(pageOf(appointments(20), 1000))
      .mockResolvedValueOnce(pageOf(appointments(20), 1000))

    await expect(service.getAllPastAppointments('X123456')).rejects.toThrow(
      'Past appointments need 49 more pages, over the limit of 10',
    )
    expect(getPastAppointments).toHaveBeenCalledTimes(2)
  })

  it('fetches up to the maximum number of extra pages', async () => {
    getPastAppointments
      .mockResolvedValueOnce(pageOf(appointments(20), 220))
      .mockResolvedValueOnce(pageOf(appointments(20), 220))
      .mockImplementation((_crn, page: number, size: number) =>
        Promise.resolve(pageOf(appointments(size, page * size), 220)),
      )

    const result = await service.getAllPastAppointments('X123456')

    expect(result).toHaveLength(220)
    expect(getPastAppointments).toHaveBeenCalledTimes(2 + MAX_EXTRA_PAST_APPOINTMENT_PAGES)
  })

  it('returns no appointments when there are none', async () => {
    getPastAppointments.mockResolvedValueOnce(pageOf([], 0))

    expect(await service.getAllPastAppointments('X123456')).toEqual([])
    expect(getPastAppointments).toHaveBeenCalledTimes(1)
  })
})
