import {
  ADDITIONAL_LICENCE_CONDITION_GROUPS,
  toAdditionalConditionGroup,
  toAdditionalConditionGroups,
  toBespokeConditionGroup,
  toLicenceTags,
  toNumberedAdditionalConditions,
} from './licenceConditions'

describe('toAdditionalConditionGroups', () => {
  it('has each code in only one group, and unique group keys', () => {
    const codes = ADDITIONAL_LICENCE_CONDITION_GROUPS.flatMap(group => group.codes.map(code => code.toLowerCase()))
    expect(new Set(codes).size).toBe(codes.length)
    const keys = ADDITIONAL_LICENCE_CONDITION_GROUPS.map(group => group.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('shows each group once, in the order it first appears in the response, whatever case the codes arrive in', () => {
    const result = toAdditionalConditionGroups([
      { code: '9678FD9E-F80D-423A-A6FB-B79909094887', restrictions: [] }, // Agree to personal searches
      { code: '0F9A20F4-35C7-4C77-8AF8-F200F153FA11', restrictions: [] }, // Areas and places you must not go to
      { code: '42f71b40-84cd-446d-8647-f00bbb6c079c', restrictions: [] }, // Areas and places you must not go to
      { code: '0a370862-5426-49c1-b6d4-3d074d78a81a', restrictions: [] }, // Follow a curfew
    ])

    expect(result).toEqual({
      groups: [
        { key: 'agree-to-personal-searches', title: 'Agree to personal searches' },
        { key: 'areas-and-places-you-must-not-go-to', title: 'Areas and places you must not go to' },
        { key: 'follow-a-curfew', title: 'Follow a curfew' },
      ],
      unknownCodes: [],
      hasUnshownElectronicMonitoring: false,
    })
  })

  it('groups both alcohol tag codes together', () => {
    const result = toAdditionalConditionGroups([
      { code: 'd36a3b77-30ba-40ce-8953-83e761d3b487', restrictions: [] },
      { code: '2f8a5418-c6e4-4f32-9e58-64b23550e504', restrictions: [] },
    ])

    expect(result.groups).toEqual([{ key: 'wear-an-alcohol-tag', title: 'Wear an alcohol tag' }])
  })

  it('shows unknown codes under their CVL category, in response order', () => {
    const result = toAdditionalConditionGroups([
      { code: 'unknown-1', category: 'Residence at a specific place', restrictions: [] },
      { code: 'unknown-2', category: 'Residence at a specific place', restrictions: [] },
      { code: 'unknown-3', restrictions: [] },
      { code: '322bb3f7-2ee1-46aa-ae1c-3f743efd4327', restrictions: [] },
    ])

    expect(result.groups).toEqual([
      { key: 'other-residence-at-a-specific-place', title: 'Residence at a specific place' },
      { key: 'other-other-licence-conditions', title: 'Other licence conditions' },
      { key: 'take-drug-tests', title: 'Take drug tests' },
    ])
    expect(result.unknownCodes).toEqual(['unknown-1', 'unknown-2', 'unknown-3'])
  })

  it('returns no groups when there are no additional conditions', () => {
    expect(toAdditionalConditionGroups(undefined)).toEqual({
      groups: [],
      unknownCodes: [],
      hasUnshownElectronicMonitoring: false,
    })
  })
})

const CURFEW = '0a370862-5426-49c1-b6d4-3d074d78a81a'
const LEAVE = '005d70e4-a247-4f82-b8b3-6d294a0f5051'
const GPS = '524f2fd6-ad53-47dd-8edc-2161d3dd2ed4'

describe('toNumberedAdditionalConditions', () => {
  it("numbers conditions by their CVL category's place in the response, and letters them within it", () => {
    // From a real CVL response: "Things you need to take part in" spans three categories.
    const result = toNumberedAdditionalConditions([
      { code: '5db26ab3-9b6f-4bee-b2aa-53aa3f3be7dd', category: 'Residence at a specific place', restrictions: [] },
      { code: 'b72fdbf2-0dc9-4e7f-81e4-c2ccb5d1bc90', category: 'Contact with a person', restrictions: [] },
      { code: '9ae2a336-3491-4667-aaed-dd852b09b4b9', category: 'Contact with a person', restrictions: [] },
      { code: '4858cd8b-bca6-4f11-b6ee-439e27216d7d', category: 'Contact with a person', restrictions: [] },
      { code: 'df3f08a8-4ae0-41fe-b3bc-d0be1fd2d8aa', category: 'Programmes or activities', restrictions: [] },
      { code: '9da214a3-c6ae-45e1-a465-12e22adf7c87', category: 'Programmes or activities', restrictions: [] },
      { code: '0EDB6D01-46B6-408F-971C-0EBFF5FA93F0', category: 'Programmes or activities', restrictions: [] },
    ])

    expect(result.map(({ groupKey, number, letter }) => `${number}${letter} ${groupKey}`)).toEqual([
      '1a area-you-must-live-in',
      '2a things-you-need-to-take-part-in',
      '2b things-you-need-to-take-part-in',
      '2c people-you-must-not-contact-or-associate-with',
      '3a things-you-need-to-take-part-in',
      '3b things-you-are-not-allowed-to-do',
      '3c things-you-need-to-take-part-in',
    ])
  })

  it('keeps counting a category that appears again later in the response', () => {
    const result = toNumberedAdditionalConditions([
      { code: CURFEW, category: 'Curfew arrangement', restrictions: [] },
      { code: GPS, category: 'Electronic monitoring', restrictions: [] },
      { code: CURFEW, category: 'Curfew arrangement', restrictions: [] },
    ])

    expect(result.map(({ number, letter }) => `${number}${letter}`)).toEqual(['1a', '2a', '1b'])
  })

  it('returns nothing when there are no additional conditions', () => {
    expect(toNumberedAdditionalConditions(undefined)).toEqual([])
  })
})

describe('toAdditionalConditionGroup', () => {
  const conditions = [
    { code: LEAVE, category: 'Freedom of movement', text: 'Stay in Leeds', restrictions: [] as string[] },
    { code: CURFEW, category: 'Curfew arrangement', text: 'Stay at home from 7pm', restrictions: [] as string[] },
    { code: CURFEW, category: 'Curfew arrangement', text: 'Stay at home at weekends', restrictions: [] as string[] },
  ]

  it("returns the group's title and its numbered conditions", () => {
    expect(toAdditionalConditionGroup(conditions, 'follow-a-curfew')).toEqual({
      key: 'follow-a-curfew',
      title: 'Follow a curfew',
      conditions: [
        { groupKey: 'follow-a-curfew', number: 2, letter: 'a', text: 'Stay at home from 7pm' },
        { groupKey: 'follow-a-curfew', number: 2, letter: 'b', text: 'Stay at home at weekends' },
      ],
    })
  })

  it('returns undefined for a group the person has no conditions in', () => {
    expect(toAdditionalConditionGroup(conditions, 'take-drug-tests')).toBeUndefined()
    expect(toAdditionalConditionGroup(conditions, 'not-a-group')).toBeUndefined()
    expect(toAdditionalConditionGroup(undefined, 'follow-a-curfew')).toBeUndefined()
  })
})

describe('electronic monitoring', () => {
  const EM = 'FD129172-BDD3-4D97-A4A0-EFD7B47A49D4'
  const RF = '86e6f2a9-bb60-40f8-9ac4-310ebc72ac2f'
  const ALCOHOL = 'd36a3b77-30ba-40ce-8953-83e761d3b487'
  const tag = (code: string, text: string) => ({
    code,
    category: 'Electronic monitoring',
    text,
    restrictions: [] as string[],
  })
  const conditions = [
    { code: CURFEW, category: 'Curfew arrangement', text: 'Curfew', restrictions: [] as string[] },
    tag(EM, 'Agree to a tag'),
    tag(GPS, 'GPS'),
    tag(RF, 'RF'),
  ]

  it('has no page of its own: only the tag pages the person has', () => {
    expect(toAdditionalConditionGroups(conditions)).toEqual({
      groups: [
        { key: 'follow-a-curfew', title: 'Follow a curfew' },
        { key: 'wear-a-gps-tag', title: 'Wear a GPS tag' },
        { key: 'wear-a-curfew-or-rf-tag', title: 'Wear a curfew or a radio frequency (RF) tag' },
      ],
      unknownCodes: [],
      hasUnshownElectronicMonitoring: false,
    })
  })

  it('is shown first on every tag page, numbered by its place in the response', () => {
    const summary = (key: string) =>
      toAdditionalConditionGroup(conditions, key).conditions.map(
        ({ number, letter, text }) => `${number}${letter} ${text}`,
      )

    expect(summary('wear-a-gps-tag')).toEqual(['2a Agree to a tag', '2b GPS'])
    expect(summary('wear-a-curfew-or-rf-tag')).toEqual(['2a Agree to a tag', '2c RF'])
    expect(summary('follow-a-curfew')).toEqual(['1a Curfew'])
    expect(toAdditionalConditionGroup(conditions, 'wear-an-alcohol-tag')).toBeUndefined()
    expect(toAdditionalConditionGroup(conditions, 'electronic-monitoring')).toBeUndefined()
  })

  it('shows both alcohol conditions on the alcohol tag page', () => {
    const result = toAdditionalConditionGroup(
      [
        tag(EM, 'Agree to a tag'),
        tag(ALCOHOL, 'No alcohol'),
        tag('2F8A5418-C6E4-4F32-9E58-64B23550E504', 'Monitor alcohol'),
      ],
      'wear-an-alcohol-tag',
    )

    expect(result.title).toBe('Wear an alcohol tag')
    expect(result.conditions.map(({ text }) => text)).toEqual(['Agree to a tag', 'No alcohol', 'Monitor alcohol'])
  })

  it('is flagged when the person has no tag condition to show it with', () => {
    const result = toAdditionalConditionGroups([tag(EM, 'Agree to a tag')])

    expect(result.groups).toEqual([])
    expect(result.hasUnshownElectronicMonitoring).toBe(true)
  })
})

describe('toBespokeConditionGroup', () => {
  const additional = [
    { code: CURFEW, category: 'Curfew arrangement', restrictions: [] as string[] },
    { code: CURFEW, category: 'Curfew arrangement', restrictions: [] as string[] },
    { code: GPS, category: 'Electronic monitoring', restrictions: [] as string[] },
  ]

  it('numbers bespoke conditions on from the additional condition categories, without letters', () => {
    expect(toBespokeConditionGroup(additional, [{ text: 'First' }, { text: '' }, { text: 'Second' }])).toEqual({
      key: 'bespoke-licence-conditions',
      title: 'Bespoke licence conditions',
      conditions: [
        { groupKey: 'bespoke-licence-conditions', number: 3, text: 'First' },
        { groupKey: 'bespoke-licence-conditions', number: 4, text: 'Second' },
      ],
    })
  })

  it('starts at 1 when there are no additional conditions', () => {
    expect(toBespokeConditionGroup(undefined, [{ text: 'Only' }]).conditions[0].number).toBe(1)
  })

  it('returns undefined when there are no bespoke conditions with text', () => {
    expect(toBespokeConditionGroup(additional, [])).toBeUndefined()
    expect(toBespokeConditionGroup(additional, [{ text: '' }, { text: '   ' }, {}])).toBeUndefined()
    expect(toBespokeConditionGroup(additional, undefined)).toBeUndefined()
  })
})

describe('toLicenceTags', () => {
  const EM = 'fd129172-bdd3-4d97-a4a0-efd7b47a49d4'
  const RF = '86e6f2a9-bb60-40f8-9ac4-310ebc72ac2f'
  const ALCOHOL = 'd36a3b77-30ba-40ce-8953-83e761d3b487'
  const ALCOHOL_MONITORING = '2F8A5418-C6E4-4F32-9E58-64B23550E504'
  const condition = (code: string, text: string) => ({
    code,
    category: 'Electronic monitoring',
    text,
    restrictions: [] as string[],
  })

  it('shows one tag per tag group, in response order, with the end date from its own condition text', () => {
    expect(
      toLicenceTags([
        condition(EM, 'You must agree to have an electronic monitoring tag ... until Saturday 31 December 2033.'),
        condition(
          GPS,
          'Your whereabouts will be electronically monitored by GPS Satellite Tagging, ending on Sunday 25 December 2033, and ...',
        ),
        condition(
          RF,
          'You must stay at LC Building between 5pm and midnight every day until your electronic tag is installed.',
        ),
        condition(ALCOHOL, 'You must not drink any alcohol until Saturday 31 December 2033.'),
      ]),
    ).toEqual([
      { tagType: 'a GPS', endDate: '2033-12-25' },
      // No date in its own text, so the general electronic monitoring condition's date is used.
      { tagType: 'a curfew or radio frequency (RF)', endDate: '2033-12-31' },
      { tagType: 'an alcohol', endDate: '2033-12-31' },
    ])
  })

  it("uses the latest date across a tag group's conditions", () => {
    expect(
      toLicenceTags([
        condition(ALCOHOL, 'You must not drink any alcohol until Saturday 31 December 2033.'),
        condition(
          ALCOHOL_MONITORING,
          'You will need to wear an electronic tag all the time until Friday 30 December 2033 so ...',
        ),
      ]),
    ).toEqual([{ tagType: 'an alcohol', endDate: '2033-12-31' }])
  })

  it('reads dates without a day name', () => {
    expect(toLicenceTags([condition(GPS, 'Monitored by GPS until 4 March 2027.')])).toEqual([
      { tagType: 'a GPS', endDate: '2027-03-04' },
    ])
  })

  it('leaves the end date out when there is none to find', () => {
    expect(toLicenceTags([condition(RF, 'Stay at home until your electronic tag is installed.')])).toEqual([
      { tagType: 'a curfew or radio frequency (RF)', endDate: undefined },
    ])
  })

  it('shows no tags for the general electronic monitoring condition alone, or for other conditions', () => {
    expect(toLicenceTags([condition(EM, 'Agree to a tag until 1 January 2030.')])).toEqual([])
    expect(toLicenceTags([{ code: CURFEW, category: 'Curfew arrangement', restrictions: [] }])).toEqual([])
    expect(toLicenceTags(undefined)).toEqual([])
  })
})
