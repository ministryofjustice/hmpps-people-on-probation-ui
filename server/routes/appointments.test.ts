import type { Express } from 'express'
import request from 'supertest'
import { appWithAllRoutes, createAppSessionCookie } from './testutils/appSetup'
import { buildCalendarFilename, buildCalendarUrl, generateIcs } from './appointments'
import type { Services } from '../services'
import config from '../config'

describe('generateIcs', () => {
  it('escapes text fields for iCalendar clients', () => {
    const ics = generateIcs({
      date: '2026-08-10',
      startTime: '14:00',
      endTime: '14:30',
      title: 'Office Appointment; Review',
      location: 'Probation Office, Market Road, Leeds, LS2 2BB',
    })

    expect(ics).toContain('SUMMARY:Office Appointment\\; Review')
    expect(ics).toContain('LOCATION:Probation Office\\, Market Road\\, Leeds\\, LS2 2BB')
  })

  it('omits DTEND for timed appointments without an end time', () => {
    const ics = generateIcs({
      date: '2026-08-10',
      startTime: '14:00',
      title: 'Office Appointment',
    })

    expect(ics).toContain('DTSTART;TZID=Europe/London:20260810T140000')
    expect(ics).not.toContain('DTEND')
  })

  it('sets all-day appointment DTEND to the next day', () => {
    const ics = generateIcs({
      date: '2026-08-10',
      title: 'Office Appointment',
    })

    expect(ics).toContain('DTSTART;VALUE=DATE:20260810')
    expect(ics).toContain('DTEND;VALUE=DATE:20260811')
  })

  it('uses a stable UID for the same appointment', () => {
    const appointment = {
      date: '2026-08-10',
      startTime: '14:00',
      endTime: '14:30',
      title: 'Office Appointment',
      location: 'Probation Office, Market Road, Leeds, LS2 2BB',
    }

    const firstUid = generateIcs(appointment).match(/^UID:(.+)$/m)?.[1]
    const secondUid = generateIcs(appointment).match(/^UID:(.+)$/m)?.[1]

    expect(firstUid).toEqual(secondUid)
    expect(firstUid).toEqual('2026-08-10-14-00-14-30-office-appointment@hmpps-probation')
  })
})

describe('buildCalendarFilename', () => {
  it('builds a meaningful calendar filename from title and date', () => {
    expect(buildCalendarFilename('2026-08-10', 'Office Appointment')).toEqual('office-appointment-2026-08-10.ics')
  })

  it('falls back to appointment when there is no title', () => {
    expect(buildCalendarFilename('2026-08-10')).toEqual('appointment-2026-08-10.ics')
  })
})

describe('buildCalendarUrl', () => {
  it('includes endTime only when startTime is present', () => {
    const calendarUrl = buildCalendarUrl({
      date: '2026-08-10',
      endTime: '14:30',
      type: 'Office Appointment',
    })

    expect(calendarUrl).toBe('/appointments/calendar?date=2026-08-10&title=Office+Appointment')
  })

  it('includes startTime and endTime together for timed appointments', () => {
    const calendarUrl = buildCalendarUrl({
      date: '2026-08-10',
      startTime: '14:00',
      endTime: '14:30',
      type: 'Office Appointment',
    })

    expect(calendarUrl).toBe(
      '/appointments/calendar?date=2026-08-10&startTime=14%3A00&endTime=14%3A30&title=Office+Appointment',
    )
  })
})

describe('GET /appointments/calendar', () => {
  let app: Express

  beforeEach(() => {
    app = appWithAllRoutes({})
  })

  it('returns a calendar file with a meaningful filename', async () => {
    const response = await request(app)
      .get('/appointments/calendar?date=2026-08-10&startTime=14:00&endTime=14:30&title=Office%20Appointment')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect('Content-Type', /text\/calendar/)
      .expect('Content-Disposition', 'attachment; filename="office-appointment-2026-08-10.ics"')
      .expect(200)

    expect(response.text).toContain('DTSTART;TZID=Europe/London:20260810T140000')
    expect(response.text).toContain('DTEND;TZID=Europe/London:20260810T143000')
    expect(response.text).toContain('SUMMARY:Office Appointment')
  })

  it('accepts start and end times with seconds', async () => {
    const response = await request(app)
      .get(
        '/appointments/calendar?date=2026-06-15&startTime=13%3A00%3A00&endTime=15%3A00%3A00&title=Planned+Office+Visit+%28NS%29',
      )
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('DTSTART;TZID=Europe/London:20260615T130000')
    expect(response.text).toContain('DTEND;TZID=Europe/London:20260615T150000')
    expect(response.text).toContain('SUMMARY:Planned Office Visit (NS)')
  })

  it('rejects array query values', async () => {
    await request(app)
      .get('/appointments/calendar?date=2026-08-10&startTime[]=14:00')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(400)
  })

  it('rejects repeated query values', async () => {
    await request(app)
      .get('/appointments/calendar?date=2026-08-10&startTime=14:00&startTime=15:00')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(400)
  })

  it('rejects invalid optional time values', async () => {
    await request(app)
      .get('/appointments/calendar?date=2026-08-10&startTime=not-a-time')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(400)
  })
})

describe('GET /appointments', () => {
  let app: Express
  let peopleOnProbationService: {
    getFutureAppointments: jest.Mock
    getPastAppointments: jest.Mock
  }

  beforeEach(() => {
    config.features.missedAppointmentAlert = true

    peopleOnProbationService = {
      getFutureAppointments: jest.fn().mockResolvedValue({ content: [] }),
      getPastAppointments: jest.fn().mockResolvedValue({ content: [] }),
    }

    app = appWithAllRoutes({
      services: {
        peopleOnProbationService,
      } as unknown as Partial<Services>,
    })
  })

  afterEach(() => {
    config.features.missedAppointmentAlert = false
  })

  it('does not render the missed appointment alert when the feature flag is disabled', async () => {
    config.features.missedAppointmentAlert = false
    peopleOnProbationService.getPastAppointments.mockResolvedValue({
      content: [
        {
          date: '2026-06-10',
          type: 'Office appointment',
          nationalStandards: true,
          attended: false,
        },
      ],
    })

    const response = await request(app)
      .get('/appointments')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).not.toContain('Missed mandatory appointment or activity')
  })

  it('renders the missed mandatory appointment alert for one missed appointment', async () => {
    peopleOnProbationService.getPastAppointments.mockResolvedValue({
      content: [
        {
          date: '2026-06-10',
          startTime: '09:00',
          endTime: '10:00',
          type: 'Office appointment',
          practitioner: {
            name: {
              forename: 'Jane',
              surname: 'Smith',
            },
          },
          nationalStandards: true,
          attended: false,
        },
      ],
    })

    const response = await request(app)
      .get('/appointments')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('Missed mandatory appointment or activity')
    expect(response.text).toContain('Wednesday 10 June 2026, 9am to 10am.')
    expect(response.text).toContain('‘Office appointment’ with Jane Smith.')
    expect(response.text).toContain('your probation officer')
  })

  it('does not render unallocated practitioner names in missed appointment alerts', async () => {
    peopleOnProbationService.getPastAppointments.mockResolvedValue({
      content: [
        {
          date: '2026-06-10',
          startTime: '09:00',
          endTime: '10:00',
          type: 'Office appointment',
          practitioner: {
            name: {
              forename: 'Unallocated',
              surname: '',
            },
          },
          nationalStandards: true,
          attended: false,
        },
      ],
    })

    const response = await request(app)
      .get('/appointments')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('‘Office appointment’.')
    expect(response.text).not.toContain('with Unallocated')
    expect(response.text).not.toContain('Unallocated')
  })

  it('does not render the key contact row for unallocated practitioners', async () => {
    peopleOnProbationService.getFutureAppointments.mockResolvedValue({
      content: [
        {
          date: '2026-06-10',
          startTime: '09:00',
          endTime: '10:00',
          type: 'Office appointment',
          practitioner: {
            name: {
              forename: 'Unallocated',
              surname: '',
            },
          },
        },
      ],
    })

    const response = await request(app)
      .get('/appointments')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).not.toContain('Key contact')
    expect(response.text).not.toContain('Unallocated')
  })

  it('renders the missed mandatory appointments count alert for multiple missed appointments', async () => {
    peopleOnProbationService.getPastAppointments.mockResolvedValue({
      content: [
        {
          date: '2026-06-10',
          nationalStandards: true,
          attended: false,
        },
        {
          date: '2026-06-11',
          nationalStandards: true,
          attended: false,
        },
      ],
    })

    const response = await request(app)
      .get('/appointments')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('2 missed mandatory appointments or activities')
    expect(response.text).toContain('your probation officer')
  })

  it('counts missed mandatory appointments and missed unpaid work together', async () => {
    peopleOnProbationService.getPastAppointments.mockResolvedValue({
      content: [
        {
          date: '2026-06-10',
          nationalStandards: true,
          attended: false,
        },
        {
          date: '2026-06-11',
          nationalStandards: false,
          attended: false,
          unpaidWork: {},
        },
      ],
    })

    const response = await request(app)
      .get('/appointments')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('2 missed mandatory appointments or activities')
  })

  it('treats missed unpaid work as a mandatory activity', async () => {
    peopleOnProbationService.getPastAppointments.mockResolvedValue({
      content: [
        {
          date: '2026-06-12',
          startTime: '09:00',
          endTime: '12:00',
          type: 'Community service hours',
          nationalStandards: false,
          attended: false,
          unpaidWork: {},
        },
      ],
    })

    const response = await request(app)
      .get('/appointments')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('Missed mandatory appointment or activity')
    expect(response.text).toContain('‘Community Payback’')
  })

  it('does not render the top location row for unpaid work appointments', async () => {
    peopleOnProbationService.getFutureAppointments.mockResolvedValue({
      content: [
        {
          date: '2026-06-12',
          startTime: '09:00',
          endTime: '12:00',
          type: 'Community service hours',
          location: {
            buildingName: 'Probation Office',
            street: 'Office Street',
            town: 'Leeds',
          },
          unpaidWork: {
            pickUpLocation: {
              buildingName: 'Pickup Point',
              street: 'Pickup Street',
              town: 'Leeds',
            },
            project: {
              address: {
                buildingName: 'Work Site',
                street: 'Work Street',
                town: 'Leeds',
              },
            },
          },
        },
      ],
    })

    const response = await request(app)
      .get('/appointments')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).not.toContain('<dt class="pop-summary-card__key">Location</dt>')
    expect(response.text).toContain('Pick up and drop off address')
    expect(response.text).toContain('Pickup Point')
    expect(response.text).toContain('Work address')
    expect(response.text).toContain('Work Site')
  })

  it('does not show time for unpaid work appointments', async () => {
    peopleOnProbationService.getFutureAppointments.mockResolvedValue({
      content: [
        {
          date: '2026-06-20',
          startTime: '09:00',
          endTime: '12:00',
          type: 'Community Payback',
          unpaidWork: { project: { code: 'OTHER' } },
        },
      ],
    })

    const response = await request(app)
      .get('/appointments')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).not.toContain('9am to 12pm')
  })

  it('replaces POP Request with Your Request in appointment outcome', async () => {
    peopleOnProbationService.getPastAppointments.mockResolvedValue({
      content: [
        {
          date: '2026-06-01',
          type: 'Office visit',
          outcome: 'Rescheduled - POP Request',
          attended: true,
        },
      ],
    })

    const response = await request(app)
      .get('/appointments')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('Rescheduled - Your Request')
    expect(response.text).not.toContain('POP Request')
  })

  it('hides future appointments with the hidden project code N07TTA2', async () => {
    peopleOnProbationService.getFutureAppointments.mockResolvedValue({
      content: [
        {
          date: '2026-06-20',
          type: 'Community Payback',
          unpaidWork: { project: { code: 'N07TTA2' } },
        },
        {
          date: '2026-06-21',
          type: 'Office visit',
        },
      ],
    })

    const response = await request(app)
      .get('/appointments')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).not.toContain('Community Payback')
    expect(response.text).toContain('Office visit')
  })

  it('hides past appointments with the hidden project code N07TTA2', async () => {
    peopleOnProbationService.getPastAppointments.mockResolvedValue({
      content: [
        {
          date: '2026-06-01',
          type: 'Community Payback',
          unpaidWork: { project: { code: 'N07TTA2' } },
          attended: true,
        },
        {
          date: '2026-06-02',
          type: 'Office visit',
          attended: true,
        },
      ],
    })

    const response = await request(app)
      .get('/appointments')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).not.toContain('Community Payback')
    expect(response.text).toContain('Office visit')
  })
})
