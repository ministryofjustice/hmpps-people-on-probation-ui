import {
  convertToTitleCase,
  initialiseName,
  formatDateWithDay,
  formatDate,
  formatTime,
  formatTimeRange,
  formatDateTime,
  formatDateTimeWithDay,
  formatRemainingDuration,
  formatIntervalDuration,
  formatUnit,
  formatAddress,
  formatMapUrl,
  formatPersonName,
  formatPractitionerName,
  formatSentenceType,
  sanitiseOfficeLocationUrl,
  shouldIncludeMissedAppointmentInAlert,
} from './utils'

describe('convertToTitleCase', () => {
  it.each([
    ['empty string', '', ''],
    ['lower case', 'robert', 'Robert'],
    ['upper case', 'ROBERT', 'Robert'],
    ['mixed case', 'RoBErT', 'Robert'],
    ['multiple words', 'RobeRT SMiTH', 'Robert Smith'],
    ['leading spaces', '  RobeRT', '  Robert'],
    ['trailing spaces', 'RobeRT  ', 'Robert  '],
    ['hyphenated', 'Robert-John SmiTH-jONes-WILSON', 'Robert-John Smith-Jones-Wilson'],
  ])('%s', (_: string, input: string, expected: string) => {
    expect(convertToTitleCase(input)).toEqual(expected)
  })
})

describe('initialiseName', () => {
  it.each([
    ['null', null, null],
    ['empty string', '', null],
    ['one word', 'robert', 'r. robert'],
    ['two words', 'Robert James', 'R. James'],
    ['three words', 'Robert James Smith', 'R. Smith'],
    ['double barrelled', 'Robert-John Smith-Jones-Wilson', 'R. Smith-Jones-Wilson'],
  ])('%s', (_: string, input: string, expected: string) => {
    expect(initialiseName(input)).toEqual(expected)
  })
})

describe('formatDateWithDay', () => {
  it.each([
    ['undefined', undefined, undefined],
    ['valid date', '2026-05-18', 'Monday 18 May 2026'],
    ['first of month', '2026-01-01', 'Thursday 1 January 2026'],
    ['end of year', '2026-12-31', 'Thursday 31 December 2026'],
    ['invalid string', 'not-a-date', 'not-a-date'],
  ])('%s', (_: string, input: string | undefined, expected: string | undefined) => {
    expect(formatDateWithDay(input)).toEqual(expected)
  })
})

describe('formatDate', () => {
  it.each([
    ['undefined', undefined, undefined],
    ['valid date', '2026-05-18', '18 May 2026'],
    ['first of month', '2026-01-01', '1 January 2026'],
    ['invalid string', 'not-a-date', 'not-a-date'],
  ])('%s', (_: string, input: string | undefined, expected: string | undefined) => {
    expect(formatDate(input)).toEqual(expected)
  })
})

describe('formatTime', () => {
  it.each([
    ['undefined', undefined, undefined],
    ['whole hour morning', '09:00', '9am'],
    ['with minutes morning', '09:30', '9:30am'],
    ['midday', '12:00', '12pm'],
    ['afternoon whole hour', '13:00', '1pm'],
    ['afternoon with minutes', '13:15', '1:15pm'],
    ['midnight', '00:00', '12am'],
    ['with seconds, whole hour', '10:00:00', '10am'],
    ['with seconds and minutes', '12:30:00', '12:30pm'],
    ['invalid', 'not-a-time', 'not-a-time'],
  ])('%s', (_: string, input: string | undefined, expected: string | undefined) => {
    expect(formatTime(input)).toEqual(expected)
  })
})

describe('formatTimeRange', () => {
  it.each([
    ['start and end', '09:00', '10:00', '9am to 10am'],
    ['start only', '09:00', undefined, '9am'],
    ['end only', undefined, '10:00', '10am'],
    ['neither', undefined, undefined, undefined],
    ['with minutes', '09:30', '10:45', '9:30am to 10:45am'],
    ['with seconds', '10:00:00', '12:00:00', '10am to 12pm'],
  ])('%s', (_: string, start: string | undefined, end: string | undefined, expected: string | undefined) => {
    expect(formatTimeRange(start, end)).toEqual(expected)
  })
})

describe('shouldIncludeMissedAppointmentInAlert', () => {
  const registeredAt = '2026-01-10T10:00:00Z'

  it('includes every missed appointment during the registration session', () => {
    expect(shouldIncludeMissedAppointmentInAlert({ lastUpdatedAt: '2025-12-01T10:00:00Z' }, registeredAt, true)).toBe(
      true,
    )
  })

  it('includes an appointment updated after registration for a returning user', () => {
    expect(shouldIncludeMissedAppointmentInAlert({ lastUpdatedAt: '2026-01-10T10:00:01Z' }, registeredAt)).toBe(true)
  })

  it.each([
    ['before registration', '2026-01-10T09:59:59Z'],
    ['at the registration time', '2026-01-10T10:00:00Z'],
    ['with an invalid update time', 'not-a-date'],
    ['without an update time', undefined],
  ])('excludes an appointment updated %s for a returning user', (_description, lastUpdatedAt) => {
    expect(shouldIncludeMissedAppointmentInAlert({ lastUpdatedAt }, registeredAt)).toBe(false)
  })

  it('excludes timestamped appointments when the registration time is invalid', () => {
    expect(shouldIncludeMissedAppointmentInAlert({ lastUpdatedAt: '2026-01-11T10:00:00Z' }, 'not-a-date')).toBe(false)
  })

  it('preserves missed alerts for an admin preview session without a registration timestamp', () => {
    expect(shouldIncludeMissedAppointmentInAlert({ lastUpdatedAt: '2025-12-01T10:00:00Z' })).toBe(true)
  })
})

describe('formatDateTime', () => {
  it.each([
    ['undefined', undefined, undefined],
    ['on the hour', '2026-05-18T15:00:00', '18 May 2026, 3pm'],
    ['with minutes', '2026-05-18T15:30:00', '18 May 2026, 3:30pm'],
    ['morning', '2026-04-10T09:00:00', '10 April 2026, 9am'],
    ['invalid', 'not-a-date', 'not-a-date'],
  ])('%s', (_: string, input: string | undefined, expected: string | undefined) => {
    expect(formatDateTime(input)).toEqual(expected)
  })
})

describe('formatDateTimeWithDay', () => {
  it.each([
    ['undefined', undefined, undefined],
    ['on the hour', '2026-05-18T15:00:00', 'Monday 18 May 2026, 3pm'],
    ['with minutes', '2026-05-18T15:30:00', 'Monday 18 May 2026, 3:30pm'],
    ['invalid', 'not-a-date', 'not-a-date'],
  ])('%s', (_: string, input: string | undefined, expected: string | undefined) => {
    expect(formatDateTimeWithDay(input)).toEqual(expected)
  })
})

describe('formatRemainingDuration', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-05-27'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it.each([
    ['past date', '2026-01-01', '0 days'],
    ['today (end date = last day)', '2026-05-27', '1 day'],
    ['1 day away', '2026-05-28', '2 days'],
    ['5 days away', '2026-06-01', '6 days'],
    ['exact 1 month away', '2026-06-27', '1 month, 1 day'],
    ['1 month 1 day away', '2026-06-28', '1 month, 2 days'],
    ['exact 12 months away', '2027-05-27', '1 year, 1 day'],
    ['months with overshoot (end day < today day)', '2027-06-21', '1 year, 26 days'],
    ['exact 2 years away', '2028-05-27', '2 years, 1 day'],
    ['13 months exactly', '2027-06-27', '1 year, 1 month, 1 day'],
  ])('%s', (_: string, endDate: string, expected: string) => {
    expect(formatRemainingDuration(endDate)).toEqual(expected)
  })
})

describe('formatIntervalDuration', () => {
  it.each([
    ['1 day', new Date('2026-05-27'), new Date('2026-05-28'), '1 day'],
    ['2 days', new Date('2026-05-27'), new Date('2026-05-29'), '2 days'],
    ['1 month', new Date('2026-05-27'), new Date('2026-06-27'), '1 month'],
    ['1 month 1 day', new Date('2026-05-27'), new Date('2026-06-28'), '1 month, 1 day'],
    ['1 year', new Date('2025-06-11'), new Date('2026-06-11'), '1 year'],
    ['1 year 1 day', new Date('2025-06-11'), new Date('2026-06-12'), '1 year, 1 day'],
    ['2 years', new Date('2025-06-11'), new Date('2027-06-11'), '2 years'],
    ['2 years 26 days (inclusive end via addDays)', new Date('2025-06-11'), new Date('2027-07-07'), '2 years, 26 days'],
    ['2 months 30 days normalises to 3 months', new Date('2025-01-02'), new Date('2025-04-01'), '3 months'],
    ['11 months 30 days normalises to 1 year', new Date('2025-02-01'), new Date('2026-01-31'), '1 year'],
  ])('%s', (_: string, start: Date, end: Date, expected: string) => {
    expect(formatIntervalDuration(start, end)).toEqual(expected)
  })
})

describe('formatUnit', () => {
  it.each([
    ['hours plural', 'HOURS', 5, 'hours'],
    ['hours singular', 'HOURS', 1, 'hour'],
    ['days plural', 'DAYS', 3, 'days'],
    ['days singular', 'DAYS', 1, 'day'],
    ['months plural', 'MONTHS', 2, 'months'],
    ['months singular', 'MONTHS', 1, 'month'],
    ['undefined unit', undefined, 5, 'units'],
    ['lowercase input', 'hours', 2, 'hours'],
  ])('%s', (_: string, unit: string | undefined, amount: number, expected: string) => {
    expect(formatUnit(unit, amount)).toEqual(expected)
  })
})

describe('formatAddress', () => {
  it('returns empty array for undefined', () => {
    expect(formatAddress(undefined)).toEqual([])
  })

  it('returns empty array for empty address object', () => {
    expect(formatAddress({})).toEqual([])
  })

  it('formats full address', () => {
    expect(
      formatAddress({
        houseNumber: '10',
        buildingName: 'Downing Street',
        street: 'Westminster',
        town: 'London',
        district: 'City of Westminster',
        county: 'Greater London',
        postcode: 'SW1A 2AA',
      }),
    ).toEqual(['10 Downing Street', 'Westminster', 'London', 'City of Westminster', 'Greater London', 'SW1A 2AA'])
  })

  it('skips missing fields', () => {
    expect(formatAddress({ street: 'Market Road', town: 'Leeds', postcode: 'LS2 2BB' })).toEqual([
      'Market Road',
      'Leeds',
      'LS2 2BB',
    ])
  })

  it('combines house number and building name', () => {
    expect(formatAddress({ houseNumber: '123', buildingName: 'Probation Office' })).toEqual(['123 Probation Office'])
  })

  it('uses building name alone when no house number', () => {
    expect(formatAddress({ buildingName: 'Probation Office', street: 'High Street' })).toEqual([
      'Probation Office',
      'High Street',
    ])
  })

  it('formats uppercase address fields consistently', () => {
    expect(
      formatAddress({
        houseNumber: '10A',
        buildingName: 'PROBATION OFFICE',
        street: 'HIGH STREET',
        town: 'LEEDS',
        district: 'CITY CENTRE',
        county: 'WEST YORKSHIRE',
        postcode: 'ls2 2bb',
      }),
    ).toEqual(['10A Probation Office', 'High Street', 'Leeds', 'City Centre', 'West Yorkshire', 'LS2 2BB'])
  })
})

describe('formatMapUrl', () => {
  it('returns null for an empty address', () => {
    expect(formatMapUrl([])).toBeNull()
  })

  it('joins and encodes address lines', () => {
    expect(formatMapUrl(['Probation Office', 'Market Road', 'Leeds', 'LS2 2BB'])).toEqual(
      'https://maps.google.com/?q=Probation%20Office%2C%20Market%20Road%2C%20Leeds%2C%20LS2%202BB',
    )
  })
})

describe('formatPersonName', () => {
  it('returns undefined for undefined', () => {
    expect(formatPersonName(undefined)).toBeUndefined()
  })

  it('formats forename and surname', () => {
    expect(formatPersonName({ forename: 'John', surname: 'Smith' })).toEqual('John Smith')
  })

  it('includes middle name when present', () => {
    expect(formatPersonName({ forename: 'John', middleName: 'Michael', surname: 'Smith' })).toEqual(
      'John Michael Smith',
    )
  })

  it('skips middle name when absent', () => {
    expect(formatPersonName({ forename: 'Jane', surname: 'Doe' })).toEqual('Jane Doe')
  })
})

describe('formatPractitionerName', () => {
  it('returns undefined for unallocated practitioner names', () => {
    expect(formatPractitionerName({ forename: 'Unallocated', surname: '' })).toBeUndefined()
    expect(formatPractitionerName({ forename: 'Probation', surname: 'Unallocated' })).toBeUndefined()
  })

  it('formats allocated practitioner names', () => {
    expect(formatPractitionerName({ forename: 'Jane', surname: 'Doe' })).toEqual('Jane Doe')
  })
})

describe('sanitiseOfficeLocationUrl', () => {
  it('returns undefined when the url is missing or null', () => {
    expect(sanitiseOfficeLocationUrl(undefined)).toBeUndefined()
    expect(sanitiseOfficeLocationUrl(null)).toBeUndefined()
    expect(sanitiseOfficeLocationUrl('')).toBeUndefined()
  })

  it('returns undefined for malformed urls', () => {
    expect(sanitiseOfficeLocationUrl('not a url')).toBeUndefined()
  })

  it('returns undefined for non-https schemes', () => {
    expect(sanitiseOfficeLocationUrl(`${'java'}script:alert(1)`)).toBeUndefined()
    expect(sanitiseOfficeLocationUrl('http://www.gov.uk/guidance/some-office')).toBeUndefined()
  })

  it('returns undefined for urls on a different host', () => {
    expect(sanitiseOfficeLocationUrl('https://evil.example.com/gov.uk')).toBeUndefined()
  })

  it('returns the url when it is a valid https www.gov.uk link', () => {
    expect(sanitiseOfficeLocationUrl('https://www.gov.uk/guidance/havering-pioneer-house')).toEqual(
      'https://www.gov.uk/guidance/havering-pioneer-house',
    )
  })
})

describe('formatSentenceType', () => {
  it('returns undefined when the type is missing', () => {
    expect(formatSentenceType(undefined)).toBeUndefined()
    expect(formatSentenceType('')).toBeUndefined()
  })

  it('strips the SA2020 prefix', () => {
    expect(formatSentenceType('SA2020 Suspended Sentence Order')).toEqual('Suspended Sentence Order')
    expect(formatSentenceType('SA2020 Community Order')).toEqual('Community Order')
  })

  it('maps ORA Adult Custody (not PSS) to Licence', () => {
    expect(formatSentenceType('ORA Adult Custody (not PSS)')).toEqual('Licence')
  })

  it('leaves other sentence types unchanged', () => {
    expect(formatSentenceType('ORA Community Order')).toEqual('ORA Community Order')
  })
})
