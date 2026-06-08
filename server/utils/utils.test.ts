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
  formatDuration,
  formatUnit,
  formatAddress,
  formatPersonName,
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
  ])('%s', (_: string, start: string | undefined, end: string | undefined, expected: string | undefined) => {
    expect(formatTimeRange(start, end)).toEqual(expected)
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
    ['today', '2026-05-27', '0 days'],
    ['1 day', '2026-05-28', '1 day'],
    ['5 days', '2026-06-01', '5 days'],
    ['exact 1 month', '2026-06-27', '1 month'],
    ['1 month 1 day', '2026-06-28', '1 month 1 day'],
    ['exact 12 months', '2027-05-27', '12 months'],
    ['months with overshoot (end day < today day)', '2027-06-21', '12 months 25 days'],
    ['exact 2 years', '2028-05-27', '24 months'],
    ['13 months exactly', '2027-06-27', '13 months'],
  ])('%s', (_: string, endDate: string, expected: string) => {
    expect(formatRemainingDuration(endDate)).toEqual(expected)
  })
})

describe('formatDuration', () => {
  it.each([
    ['zero days', 0, '0 days'],
    ['negative days', -5, '0 days'],
    ['1 day', 1, '1 day'],
    ['2 days', 2, '2 days'],
    ['29 days', 29, '29 days'],
    ['30 days (1 month)', 30, '1 month'],
    ['31 days', 31, '1 month 1 day'],
    ['60 days (2 months)', 60, '2 months'],
    ['61 days', 61, '2 months 1 day'],
    ['1 month exactly', 30, '1 month'],
  ])('%s', (_: string, input: number, expected: string) => {
    expect(formatDuration(input)).toEqual(expected)
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
