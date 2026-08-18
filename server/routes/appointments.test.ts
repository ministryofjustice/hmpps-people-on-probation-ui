import type { Express } from 'express'
import request from 'supertest'
import { appWithAllRoutes, createAppSessionCookie } from './testutils/appSetup'
import {
  buildCalendarFilename,
  buildCalendarUrl,
  generateIcs,
  resolveAppointmentType,
  resolveOutcomeTag,
} from './appointments'
import type { Services } from '../services'
import config from '../config'

describe('resolveAppointmentType', () => {
  it('maps a known typeCode to its user-friendly label, ignoring the free-text type', () => {
    expect(resolveAppointmentType({ typeCode: 'COAP', type: 'Planned Office Visit (NS)' })).toBe(
      'In-person appointment',
    )
    expect(resolveAppointmentType({ typeCode: 'COPT', type: 'Planned Telephone Contact (NS)' })).toBe(
      'Phone appointment',
    )
    expect(resolveAppointmentType({ typeCode: 'COVC', type: 'Planned Video Contact (NS)' })).toBe('Video appointment')
    expect(resolveAppointmentType({ typeCode: 'CHVS', type: 'Home Visit to Case (NS)' })).toBe('Home visit')
    expect(resolveAppointmentType({ typeCode: 'CUPA', type: 'CP/UPW - Appointment/Attendance (NS)' })).toBe(
      'Community payback (unpaid work)',
    )
    expect(resolveAppointmentType({ typeCode: 'DRGAPT', type: 'Drug Test Appointment (NS)' })).toBe(
      'Drug test appointment',
    )
    expect(resolveAppointmentType({ typeCode: 'DRGDAA', type: 'Appointment for Drug Testing Assessment (NS)' })).toBe(
      'Drug test assessment',
    )
    expect(resolveAppointmentType({ typeCode: 'GTS', type: 'Final Appointment with Provider' })).toBe(
      'Final appointment with support service',
    )
    expect(resolveAppointmentType({ typeCode: 'GTS1', type: 'Initial Appointment with Provider' })).toBe(
      'First appointment with support service',
    )
    expect(resolveAppointmentType({ typeCode: 'CAPW', type: 'AcP - Attendance -Pre-Group 1:1 (NS)' })).toBe(
      'Meeting before course',
    )
  })

  it('matches the code case-insensitively', () => {
    expect(resolveAppointmentType({ typeCode: 'coap', type: 'Planned Office Visit (NS)' })).toBe(
      'In-person appointment',
    )
  })

  it('always uses the unpaid work label when unpaidWork is present, regardless of typeCode', () => {
    expect(resolveAppointmentType({ typeCode: 'COAP', type: 'Anything at all', unpaidWork: {} })).toBe(
      'Community payback (unpaid work)',
    )
  })

  it('falls back to the NS-stripped raw type text when the typeCode is missing or unrecognised', () => {
    expect(resolveAppointmentType({ type: 'Some Brand New Contact Type (NS)' })).toBe('Some Brand New Contact Type')
    expect(resolveAppointmentType({ typeCode: 'ZZZZ', type: 'Some Brand New Contact Type (NS)' })).toBe(
      'Some Brand New Contact Type',
    )
  })

  it('returns undefined when there is no type, no typeCode, and no unpaid work', () => {
    expect(resolveAppointmentType({})).toBeUndefined()
  })
})

describe('resolveOutcomeTag', () => {
  it('maps known outcome text to its friendly label and colour', () => {
    expect(resolveOutcomeTag('Attended - Complied')).toEqual({ text: 'Attended', classes: 'govuk-tag--green' })
    expect(resolveOutcomeTag('Attended - Failed to Comply')).toEqual({
      text: 'Attended but failed to comply',
      classes: 'govuk-tag--red',
    })
    expect(resolveOutcomeTag('Attended - Sent Home (behaviour)')).toEqual({
      text: 'Attended but failed to comply',
      classes: 'govuk-tag--red',
    })
    expect(resolveOutcomeTag('Attended - Sent Home (service issues)')).toEqual({
      text: 'Attended but sent home early',
      classes: 'govuk-tag--green',
    })
    expect(resolveOutcomeTag('Failed to Attend')).toEqual({ text: 'Missed', classes: 'govuk-tag--red' })
    expect(resolveOutcomeTag('Failed to Comply with other Instruction')).toEqual({
      text: 'Did not comply with instructions',
      classes: 'govuk-tag--red',
    })
    expect(resolveOutcomeTag('Rescheduled - PoP Request')).toEqual({
      text: 'Rescheduled at your request',
      classes: 'govuk-tag--grey',
    })
    expect(resolveOutcomeTag('Rescheduled - Service Request')).toEqual({
      text: 'Rescheduled by Probation Service',
      classes: 'govuk-tag--grey',
    })
    expect(resolveOutcomeTag('Suspended')).toEqual({ text: 'Suspended', classes: 'govuk-tag--grey' })
    expect(resolveOutcomeTag('Unacceptable Absence')).toEqual({
      text: 'Missed – absence reason rejected',
      classes: 'govuk-tag--red',
    })
    expect(resolveOutcomeTag('YOT Breach - Not Enforceable')).toEqual({
      text: 'Breach – not enforceable',
      classes: 'govuk-tag--grey',
    })
  })

  it('maps any "Acceptable Absence"/"Acceptable Failure" sub-reason to the same neutral label', () => {
    expect(resolveOutcomeTag('Acceptable Absence - Court/Legal')).toEqual({
      text: 'Absence accepted',
      classes: 'govuk-tag--grey',
    })
    expect(resolveOutcomeTag('Acceptable Absence - Employment')).toEqual({
      text: 'Absence accepted',
      classes: 'govuk-tag--grey',
    })
    expect(resolveOutcomeTag('Acceptable Absence-Professional Judgement Decision')).toEqual({
      text: 'Absence accepted',
      classes: 'govuk-tag--grey',
    })
    expect(resolveOutcomeTag('Acceptable Failure - None in following 12 months')).toEqual({
      text: 'Absence accepted',
      classes: 'govuk-tag--grey',
    })
  })

  it('matches regardless of case and minor punctuation differences', () => {
    expect(resolveOutcomeTag('attended - complied')).toEqual({ text: 'Attended', classes: 'govuk-tag--green' })
    expect(resolveOutcomeTag('FAILED TO ATTEND')).toEqual({ text: 'Missed', classes: 'govuk-tag--red' })
  })

  it('falls back to a neutral tag with the original text for unrecognised outcomes', () => {
    expect(resolveOutcomeTag('Some Brand New Outcome')).toEqual({
      text: 'Some Brand New Outcome',
      classes: 'govuk-tag--grey',
    })
  })

  it('returns undefined when there is no outcome', () => {
    expect(resolveOutcomeTag(undefined)).toBeUndefined()
  })
})

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

  it('builds a date-only calendar URL for unpaid work appointments', () => {
    const calendarUrl = buildCalendarUrl({
      date: '2026-08-10',
      startTime: '14:00',
      endTime: '14:30',
      location: {
        buildingName: 'Probation Office',
        street: 'Office Street',
        town: 'Leeds',
      },
      unpaidWork: {},
    })

    expect(calendarUrl).toBe('/appointments/calendar?date=2026-08-10&title=Community+payback+%28unpaid+work%29')
    expect(calendarUrl).not.toContain('location')
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
    getSentences: jest.Mock
  }

  beforeEach(() => {
    config.features.missedAppointmentAlert = true

    peopleOnProbationService = {
      getFutureAppointments: jest.fn().mockResolvedValue({ content: [] }),
      getPastAppointments: jest.fn().mockResolvedValue({ content: [] }),
      getSentences: jest.fn().mockResolvedValue({ sentences: [] }),
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
          lastUpdatedAt: '2026-06-10T10:00:00Z',
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

  it('counts all missed appointments during the first registration session', async () => {
    peopleOnProbationService.getPastAppointments.mockResolvedValue({
      content: [
        {
          date: '2025-12-20',
          lastUpdatedAt: '2025-12-20T10:00:00Z',
          nationalStandards: true,
          attended: false,
        },
        {
          date: '2026-06-10',
          lastUpdatedAt: '2026-06-10T10:00:00Z',
          nationalStandards: true,
          attended: false,
        },
      ],
    })

    const response = await request(app)
      .get('/appointments')
      .set('Cookie', await createAppSessionCookie('X123456', undefined, true))
      .expect(200)

    expect(response.text).toContain('2 missed mandatory appointments or activities')
  })

  it('only counts appointments updated after registration for returning users', async () => {
    peopleOnProbationService.getPastAppointments.mockResolvedValue({
      content: [
        {
          date: '2025-12-20',
          lastUpdatedAt: '2025-12-20T10:00:00Z',
          nationalStandards: true,
          attended: false,
        },
        {
          date: '2026-06-10',
          lastUpdatedAt: '2026-06-10T10:00:00Z',
          type: 'Newly missed appointment',
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
    expect(response.text).toContain('‘Newly missed appointment’.')
    expect(response.text).not.toContain('2 missed mandatory appointments or activities')
  })

  it('does not render unallocated practitioner names in missed appointment alerts', async () => {
    peopleOnProbationService.getPastAppointments.mockResolvedValue({
      content: [
        {
          date: '2026-06-10',
          lastUpdatedAt: '2026-06-10T10:00:00Z',
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
          lastUpdatedAt: '2026-06-10T10:00:00Z',
          nationalStandards: true,
          attended: false,
        },
        {
          date: '2026-06-11',
          lastUpdatedAt: '2026-06-11T10:00:00Z',
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
          lastUpdatedAt: '2026-06-10T10:00:00Z',
          nationalStandards: true,
          attended: false,
        },
        {
          date: '2026-06-11',
          lastUpdatedAt: '2026-06-11T10:00:00Z',
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
          lastUpdatedAt: '2026-06-12T10:00:00Z',
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
    expect(response.text).toContain('‘Community payback (unpaid work)’')
  })

  it('only renders the date row for unpaid work appointments', async () => {
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
          practitioner: {
            name: {
              forename: 'Jane',
              surname: 'Doe',
            },
          },
        },
      ],
    })

    const response = await request(app)
      .get('/appointments')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('Friday 12 June 2026')
    expect(response.text).toContain('Add to calendar')
    expect(response.text).toContain(
      '/appointments/calendar?date=2026-06-12&amp;title=Community+payback+%28unpaid+work%29',
    )
    expect(response.text).not.toContain('startTime')
    expect(response.text).not.toContain('endTime')
    expect(response.text).not.toContain('location=')
    expect(response.text).not.toContain('<dt class="pop-summary-card__key">Location</dt>')
    expect(response.text).not.toContain('<dt class="pop-summary-card__key">Time</dt>')
    expect(response.text).not.toContain('Pick up and drop off address')
    expect(response.text).not.toContain('Pickup Point')
    expect(response.text).not.toContain('Work address')
    expect(response.text).not.toContain('Work Site')
    expect(response.text).not.toContain('Key contact')
    expect(response.text).not.toContain('Jane Doe')
  })

  it.each([['COPT'], ['COVC']])(
    'hides Location, View on map and Add to calendar for phone/video appointments (typeCode %s)',
    async typeCode => {
      peopleOnProbationService.getFutureAppointments.mockResolvedValue({
        content: [
          {
            date: '2026-06-12',
            startTime: '09:00',
            endTime: '10:00',
            type: 'Planned appointment',
            typeCode,
            location: {
              buildingName: 'Probation Office',
              street: 'Office Street',
              town: 'Leeds',
            },
          },
        ],
      })

      const response = await request(app)
        .get('/appointments')
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(response.text).toContain('Friday 12 June 2026')
      expect(response.text).not.toContain('View on map')
      expect(response.text).not.toContain('Add to calendar')
      expect(response.text).not.toContain('<dt class="pop-summary-card__key">Location</dt>')
      expect(response.text).not.toContain('Probation Office')
      expect(response.text).not.toContain('/appointments/calendar')
    },
  )

  it('still shows Location, View on map and Add to calendar for an in-person appointment', async () => {
    peopleOnProbationService.getFutureAppointments.mockResolvedValue({
      content: [
        {
          date: '2026-06-12',
          startTime: '09:00',
          endTime: '10:00',
          type: 'Planned appointment',
          typeCode: 'COAP',
          location: {
            buildingName: 'Probation Office',
            street: 'Office Street',
            town: 'Leeds',
          },
        },
      ],
    })

    const response = await request(app)
      .get('/appointments')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('View on map')
    expect(response.text).toContain('Add to calendar')
    expect(response.text).toContain('<dt class="pop-summary-card__key">Location</dt>')
    expect(response.text).toContain('Probation Office')
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

  it('does not show a Status row on the upcoming tab, even if a future appointment carries a stray outcome value', async () => {
    peopleOnProbationService.getFutureAppointments.mockResolvedValue({
      content: [
        {
          date: '2026-06-20',
          type: 'Office appointment',
          outcome: 'Some unexpected value',
        },
      ],
    })

    const response = await request(app)
      .get('/appointments')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).not.toContain('<dt class="pop-summary-card__key">Status</dt>')
    expect(response.text).not.toContain('Some unexpected value')
  })

  it('never shows a Mandatory tag, even for national standards appointments or titles containing "NS"', async () => {
    peopleOnProbationService.getFutureAppointments.mockResolvedValue({
      content: [
        {
          date: '2026-06-20',
          type: 'Planned Office Visit (NS)',
          nationalStandards: true,
        },
      ],
    })

    const response = await request(app)
      .get('/appointments')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).not.toContain('Mandatory')
  })

  it('maps a known outcome to its friendly label and colour', async () => {
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
      .get('/appointments?tab=past')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('Rescheduled at your request')
    expect(response.text).toContain('govuk-tag--grey')
    expect(response.text).not.toContain('POP Request')
  })

  it('shows outcome status for past unpaid work appointments', async () => {
    peopleOnProbationService.getPastAppointments.mockResolvedValue({
      content: [
        {
          date: '2026-06-01',
          outcome: 'Attended',
          unpaidWork: { project: { code: 'PROJ1', description: 'Community work' } },
        },
      ],
    })

    const response = await request(app)
      .get('/appointments?tab=past')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('Attended')
    expect(response.text).toContain('Status')
  })

  it('shows the tag appointments guidance when a requirement main category is a tag code', async () => {
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [
        {
          requirements: [{ mainCategory: { code: 'RM49', description: 'Tag' } }],
          licenceConditions: [],
        },
      ],
    })

    const response = await request(app)
      .get('/appointments')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('Tag appointments are sent by the electronic monitoring service')
    expect(response.text).not.toContain('Appointments outside the Probation Service are sent through other channels')
    expect(response.text).toContain('Why this might happen')
  })

  it('shows the other-channel appointments guidance when a licence condition main category matches', async () => {
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [
        {
          requirements: [],
          licenceConditions: [{ mainCategory: { code: 'Q', description: 'Some licence condition' } }],
        },
      ],
    })

    const response = await request(app)
      .get('/appointments')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('Appointments outside the Probation Service are sent through other channels')
    expect(response.text).not.toContain('Tag appointments are sent by the electronic monitoring service')
    expect(response.text).toContain('Why this might happen')
  })

  it('shows the plain inset text with no reveal when only RAR/unpaid work main categories are present', async () => {
    peopleOnProbationService.getSentences.mockResolvedValue({
      sentences: [
        {
          requirements: [{ mainCategory: { code: 'F', description: 'RAR' } }],
          licenceConditions: [{ mainCategory: { code: 'W', description: 'Unpaid work' } }],
        },
      ],
    })

    const response = await request(app)
      .get('/appointments')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).not.toContain('Tag appointments are sent by the electronic monitoring service')
    expect(response.text).not.toContain('Appointments outside the Probation Service are sent through other channels')
    expect(response.text).not.toContain('Why this might happen')
    expect(response.text).not.toContain('This list might not show all appointments')
    expect(response.text).toContain('This list might not be up to date yet.')
  })

  it('keeps "Last update" stable across tabs and pages, taking the most recent of the past and future lookback fetches', async () => {
    peopleOnProbationService.getPastAppointments.mockResolvedValue({
      content: [{ date: '2026-06-01', lastUpdatedAt: '2026-06-15T10:00:00Z' }],
      page: { number: 0, size: 50, totalElements: 30, totalPages: 2 },
    })
    peopleOnProbationService.getFutureAppointments.mockResolvedValue({
      content: [{ date: '2026-07-01', lastUpdatedAt: '2026-07-20T10:00:00Z' }],
    })

    const upcomingResponse = await request(app)
      .get('/appointments')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)
    const pastPage2Response = await request(app)
      .get('/appointments?tab=past&page=2')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    // Both responses should show the same "Last update" — derived from the always-fetched
    // past and future lookbacks, not from whichever page/tab is currently displayed — and it
    // should reflect the most recent update across both, not just the past lookback.
    expect(upcomingResponse.text).toContain('Last update: 20 July 2026')
    expect(pastPage2Response.text).toContain('Last update: 20 July 2026')
  })

  it('defaults to the upcoming tab, fetching from the future-appointments endpoint at a page size of 15', async () => {
    const response = await request(app)
      .get('/appointments')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(peopleOnProbationService.getFutureAppointments).toHaveBeenCalledWith('X123456', 0, 15)
    expect(response.text).toContain('Upcoming appointments and activities')
    expect(response.text).toMatch(/moj-sub-navigation__link" aria-current="page" href="\/appointments\?tab=upcoming"/)
    expect(response.text).not.toMatch(/moj-sub-navigation__link" aria-current="page" href="\/appointments\?tab=past"/)
  })

  it('switches to the past tab, fetching from the past-appointments endpoint at a page size of 15', async () => {
    const response = await request(app)
      .get('/appointments?tab=past')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(peopleOnProbationService.getPastAppointments).toHaveBeenCalledWith('X123456', 0, 15)
    expect(response.text).toContain('Past appointments and activities')
    expect(response.text).toMatch(/moj-sub-navigation__link" aria-current="page" href="\/appointments\?tab=past"/)
    expect(response.text).not.toMatch(
      /moj-sub-navigation__link" aria-current="page" href="\/appointments\?tab=upcoming"/,
    )
  })

  it('requests the zero-indexed API page for the requested page query value', async () => {
    await request(app)
      .get('/appointments?tab=past&page=3')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(peopleOnProbationService.getPastAppointments).toHaveBeenCalledWith('X123456', 2, 15)
  })

  it.each([['0'], ['-1'], ['not-a-number'], ['']])(
    'defaults to page 1 for an invalid page query value (%s)',
    async pageValue => {
      await request(app)
        .get(`/appointments?page=${pageValue}`)
        .set('Cookie', await createAppSessionCookie('X123456'))
        .expect(200)

      expect(peopleOnProbationService.getFutureAppointments).toHaveBeenCalledWith('X123456', 0, 15)
    },
  )

  it('renders pagination with page links, next link, and results count when there is more than one page', async () => {
    peopleOnProbationService.getFutureAppointments.mockResolvedValue({
      content: [],
      page: { number: 0, size: 15, totalElements: 30, totalPages: 2 },
    })

    const response = await request(app)
      .get('/appointments')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('Showing 1 to 15 of 30 total results')
    expect(response.text).toContain('/appointments?tab=upcoming&amp;page=2')
    expect(response.text).toContain('govuk-pagination__next')
  })

  it('does not render pagination when there is only one page', async () => {
    peopleOnProbationService.getFutureAppointments.mockResolvedValue({
      content: [],
      page: { number: 0, size: 15, totalElements: 3, totalPages: 1 },
    })

    const response = await request(app)
      .get('/appointments')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).not.toContain('govuk-pagination__list')
    expect(response.text).toContain('Showing 1 to 3 of 3 total results')
  })

  it('renders the back to top link', async () => {
    const response = await request(app)
      .get('/appointments')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(200)

    expect(response.text).toContain('Back to top')
    expect(response.text).toContain('href="#main-content"')
  })

  it('redirects to the last valid page when the requested page is beyond totalPages', async () => {
    peopleOnProbationService.getFutureAppointments.mockResolvedValue({
      content: [],
      page: { number: 0, size: 15, totalElements: 3, totalPages: 1 },
    })

    const response = await request(app)
      .get('/appointments?page=999')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(302)

    expect(response.headers.location).toBe('/appointments?tab=upcoming')
  })

  it('redirects to the last valid page for the past tab, preserving tab=past', async () => {
    peopleOnProbationService.getPastAppointments.mockResolvedValue({
      content: [],
      page: { number: 0, size: 15, totalElements: 30, totalPages: 2 },
    })

    const response = await request(app)
      .get('/appointments?tab=past&page=999')
      .set('Cookie', await createAppSessionCookie('X123456'))
      .expect(302)

    expect(response.headers.location).toBe('/appointments?tab=past&page=2')
  })
})
