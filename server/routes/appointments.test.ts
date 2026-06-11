import type { Express } from 'express'
import request from 'supertest'
import { appWithAllRoutes, createAppSessionCookie } from './testutils/appSetup'
import { buildCalendarFilename, generateIcs } from './appointments'

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
})

describe('buildCalendarFilename', () => {
  it('builds a meaningful calendar filename from title and date', () => {
    expect(buildCalendarFilename('2026-08-10', 'Office Appointment')).toEqual('office-appointment-2026-08-10.ics')
  })

  it('falls back to appointment when there is no title', () => {
    expect(buildCalendarFilename('2026-08-10')).toEqual('appointment-2026-08-10.ics')
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
