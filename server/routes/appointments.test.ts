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
})

describe('buildCalendarFilename', () => {
  it('builds a meaningful calendar filename from title and date', () => {
    expect(buildCalendarFilename('2026-08-10', 'Office Appointment')).toEqual('office-appointment-2026-08-10.ics')
  })

  it('falls back to appointment when there is no title', () => {
    expect(buildCalendarFilename('2026-08-10')).toEqual('appointment-2026-08-10.ics')
  })
})
