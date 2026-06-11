import type { Express } from 'express'
import request from 'supertest'
import { appWithAllRoutes, createAppSessionCookie } from './testutils/appSetup'
import { buildCalendarFilename, buildCalendarUrl, generateIcs } from './appointments'

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
