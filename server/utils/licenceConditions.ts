import { format, isValid, parse } from 'date-fns'
import type {
  AdditionalLicenceConditionResponse,
  BespokeLicenceConditionResponse,
} from '../data/peopleOnProbationApiClient'

// CVL codes mix upper and lower case, so they're matched without case.
const normalise = (code: string): string => code.trim().toLowerCase()

// Additional licence conditions from CVL (conditions.AP.additional), grouped into the topics we show
// people on probation. Each group has a key (its page is /licence/specific-conditions/<key>), the title
// shown on its card and as its page heading (as on its page in the design), and the CVL condition codes
// it covers. To add a code, add it to its group's codes. This list
// doesn't decide the order things are shown in: that follows the CVL response (see below).
export const ADDITIONAL_LICENCE_CONDITION_GROUPS: { key: string; title: string; codes: string[] }[] = [
  { key: 'follow-a-curfew', title: 'Follow a curfew', codes: ['0a370862-5426-49c1-b6d4-3d074d78a81a'] },
  {
    key: 'areas-you-must-not-leave',
    title: 'Areas you must not leave',
    codes: ['005d70e4-a247-4f82-b8b3-6d294a0f5051'],
  },
  {
    key: 'areas-and-places-you-must-not-go-to',
    title: 'Areas and places you must not go to',
    codes: [
      '0f9a20f4-35c7-4c77-8af8-f200f153fa11',
      '42f71b40-84cd-446d-8647-f00bbb6c079c',
      'c4a17002-88a3-43b4-b3f7-82ff476cb217',
      '5d0416a9-a4ce-4b2c-8636-0b7abaa3680a',
      '99195049-f355-46fb-b7d8-aef87a1b19c5',
      '1e9a66c6-f083-4c29-b209-b625252afbe5',
      'be16ee0b-a916-43ef-9319-b42a1dd418a3',
      '3f96ac05-ef71-43e3-ac07-1219aa26b5f3',
    ],
  },
  {
    key: 'wear-a-curfew-or-rf-tag',
    title: 'Wear a curfew or a radio frequency (RF) tag',
    codes: ['86e6f2a9-bb60-40f8-9ac4-310ebc72ac2f'],
  },
  { key: 'wear-a-gps-tag', title: 'Wear a GPS tag', codes: ['524f2fd6-ad53-47dd-8edc-2161d3dd2ed4'] },
  {
    key: 'wear-an-alcohol-tag',
    title: 'Wear an alcohol tag',
    codes: ['d36a3b77-30ba-40ce-8953-83e761d3b487', '2F8A5418-C6E4-4F32-9E58-64B23550E504'],
  },
  { key: 'take-drug-tests', title: 'Take drug tests', codes: ['322bb3f7-2ee1-46aa-ae1c-3f743efd4327'] },
  {
    key: 'things-you-are-not-allowed-to-do',
    title: 'Things you are not allowed to do',
    codes: [
      '7a9ca3bb-922a-433a-9601-1e475c6c0095',
      '985d339a-b652-40e3-b0a8-5aafd5e121f1',
      '48c4ae87-b8d8-45d1-aded-daefe8ad07fe',
      '1905aa46-59dd-4eb7-b009-81467cc8c426',
      '9da214a3-c6ae-45e1-a465-12e22adf7c87',
    ],
  },
  {
    key: 'things-you-must-tell-your-probation-officer-about',
    title: 'Things you must tell your probation officer about',
    codes: [
      '2a93b784-b8cb-49ed-95e2-a0df60723cda',
      'db2d7e24-b130-4c7e-a1bf-6bb5f3036c02',
      'c5e91330-748d-46f3-93f6-bbe5ea8324ce',
      '8686a815-b7f0-43b6-9886-f01df6a48773',
    ],
  },
  {
    key: 'things-you-are-not-allowed-to-use-have-or-own',
    title: 'Things you are not allowed to use, have or own',
    codes: [
      '8e52e16e-1abf-4251-baca-2fabfcb243d0',
      '5fa04bbf-6b7c-4b65-9388-a0115cd365a6',
      'bfbc693c-ab65-4042-920e-ddb085bc7aba',
      '2d67f68a-8adf-47a9-a68d-a6fc9f2c4556',
      '3932e5c9-4d21-4251-a747-ce6dc52dc9c0',
      '3b6b7c4f-6c06-438f-97a4-03c4167484dc',
      '50c8c01e-ec95-45f9-ad48-efa89c4faec0',
      '762677a4-4593-4bd2-a4bc-55d49b4c4230',
      'd523d711-9975-4a9a-a37e-a17bd611140f',
    ],
  },
  {
    key: 'things-you-need-to-take-part-in',
    title: 'Things you need to take part in',
    codes: [
      'b72fdbf2-0dc9-4e7f-81e4-c2ccb5d1bc90',
      '9ae2a336-3491-4667-aaed-dd852b09b4b9',
      'df3f08a8-4ae0-41fe-b3bc-d0be1fd2d8aa',
      '0EDB6D01-46B6-408F-971C-0EBFF5FA93F0',
      '625feb82-a5ab-4490-82e9-241218f775c5',
      'b149bc47-b279-427b-9ddc-c472fdc74ba5',
      'f1d2888b-be86-4732-8874-44cb867865c2',
    ],
  },
  {
    key: 'people-you-must-not-contact-or-associate-with',
    title: 'People you must not contact or associate with',
    codes: [
      '4858cd8b-bca6-4f11-b6ee-439e27216d7d',
      '4a5fed48-0fb9-4711-8ddf-b46ddfd90246',
      '355700a9-6184-40c0-9759-0dfed1994e1e',
      '0aa669bf-db8a-4b8e-b8ba-ca82fc245b94',
      'cc80d02b-0b62-4940-bac6-0bcd374c725e',
      '18b69f61-800f-46b2-95c4-2019d33e34d6',
      'd5998ca1-62a2-4409-88cd-3137d893c2a0',
      '86e7a2cb-33b5-4079-84a4-f6579347c890',
    ],
  },
  {
    key: 'people-you-must-not-live-with',
    title: 'People you must not live with',
    codes: ['fce34fb2-02f4-4eb0-9b8d-d091e11451fa'],
  },
  { key: 'area-you-must-live-in', title: 'Area you must live in', codes: ['5db26ab3-9b6f-4bee-b2aa-53aa3f3be7dd'] },
  {
    key: 'places-and-people-you-must-report-to',
    title: 'Places and people you must report to',
    codes: [
      '75a6aac6-02a7-4414-af14-942be6736892',
      '4673ebe4-9fc0-4e48-87c9-eb17d5280867',
      '2027ae19-04a2-4fa6-8d1b-a62dffba2e62',
    ],
  },
  {
    key: 'prevent-or-address-extremism',
    title: 'Prevent or address extremism',
    codes: [
      '86f8b3d6-be31-48b2-a29e-5cf662c95ad1',
      '9785d8f8-31a9-4c32-a06d-eff049ecebcd',
      '9efba199-87d4-468e-a5a1-1c0945571afa',
      '3d771cc6-b85f-47e4-9e13-75bfb80706f4',
      'e0421c22-1be7-4d06-aba7-3c17822b0c1c',
    ],
  },
  { key: 'take-polygraph-tests', title: 'Take polygraph tests', codes: ['1dc7ee29-df47-48a8-90b6-69e286692d8a'] },
  {
    key: 'agree-to-personal-searches',
    title: 'Agree to personal searches',
    codes: ['9678FD9E-F80D-423A-A6FB-B79909094887'],
  },
  {
    key: 'money-and-assets-you-are-allowed-to-have',
    title: 'Money and assets you are allowed to have',
    codes: [
      'e8478345-019a-4335-9656-73a77ffd3c42',
      '001328d0-d8bb-48ca-9f99-9c305081d0a2',
      'a9ef7376-2ab6-4490-a568-a275f4f649ab',
      '62e035ff-e755-472b-8047-3c5ea1d5b74e',
      '4e52fd9c-d436-4f82-9032-7813b130f620',
    ],
  },
]

// Tag groups, in the order the curfew help picks one to link to ("your licence conditions for wearing
// a tag"): GPS first, as on the requirements pages, then any other tag.
export const TAG_CONDITION_GROUP_KEYS = ['wear-a-gps-tag', 'wear-a-curfew-or-rf-tag', 'wear-an-alcohol-tag']

// The general electronic monitoring condition ("You must agree to have an electronic monitoring tag put
// on you..."). It has no page of its own: it's shown on each tag page the person has (curfew/RF, GPS,
// alcohol), before that tag's own conditions.
const ELECTRONIC_MONITORING_CODE = 'fd129172-bdd3-4d97-a4a0-efd7b47a49d4'
const ELECTRONIC_MONITORING_GROUP_KEY = 'electronic-monitoring'

const isElectronicMonitoring = (condition: AdditionalLicenceConditionResponse): boolean =>
  Boolean(condition.code) && normalise(condition.code) === ELECTRONIC_MONITORING_CODE

const GROUP_BY_CODE = new Map(
  ADDITIONAL_LICENCE_CONDITION_GROUPS.flatMap(group => group.codes.map(code => [normalise(code), group])),
)

export type ConditionGroupView = { key: string; title: string }

const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

// The group a condition belongs to. A code that isn't in any group yet is grouped under its CVL
// category (or "Other licence conditions"), so a new condition is never silently left out.
const groupOf = (condition: AdditionalLicenceConditionResponse): ConditionGroupView & { known: boolean } => {
  if (isElectronicMonitoring(condition)) {
    return { key: ELECTRONIC_MONITORING_GROUP_KEY, title: 'Electronic monitoring', known: true }
  }
  const group = condition.code ? GROUP_BY_CODE.get(normalise(condition.code)) : undefined
  if (group) return { key: group.key, title: group.title, known: true }
  const title = condition.category || 'Other licence conditions'
  return { key: `other-${slug(title)}`, title, known: false }
}

export type NumberedConditionView = {
  groupKey: string
  // The condition number on the licence document, e.g. 7, and its letter within that number, e.g. 'a'.
  // Bespoke conditions have a number only.
  number: number
  letter?: string
  text?: string
  // CVL's condition id, and whether it has an uploaded image (e.g. an exclusion zone map).
  id?: number
  hasImageUpload?: boolean
  // Where to load the uploaded image from, on pages that show it.
  mapUrl?: string
}

// Numbers the person's additional conditions as on their licence document, e.g. "7. (a)".
//
// We trust CVL's order. The licence document numbers additional conditions by CVL category: the number
// is the category's place in the response (1, 2, 3, ... in the order categories first appear), and the
// letter is the condition's place within its category (a, b, c, ...). Our groups don't line up with CVL
// categories, so a group's page can show conditions from several categories, with gaps in the letters
// where a condition belongs to another group, e.g. "4. (a)" then "4. (c)".
export const toNumberedAdditionalConditions = (
  conditions: AdditionalLicenceConditionResponse[] = [],
): NumberedConditionView[] => {
  const numberByCategory = new Map<string, number>()
  const countByCategory = new Map<string, number>()
  return conditions.map(condition => {
    const category = condition.category ?? ''
    if (!numberByCategory.has(category)) numberByCategory.set(category, numberByCategory.size + 1)
    const letterIndex = countByCategory.get(category) ?? 0
    countByCategory.set(category, letterIndex + 1)
    return {
      groupKey: groupOf(condition).key,
      number: numberByCategory.get(category),
      letter: String.fromCharCode(97 + letterIndex),
      text: condition.text,
      id: condition.id,
      hasImageUpload: condition.hasImageUpload,
    }
  })
}

export type AdditionalConditionGroupsView = {
  groups: ConditionGroupView[]
  // Codes that aren't in any group yet, shown under their CVL category.
  unknownCodes: string[]
  // True when the person has the general electronic monitoring condition but no tag condition, so it
  // isn't shown on any page.
  hasUnshownElectronicMonitoring: boolean
}

// The groups the person's additional conditions fall into, once each, in the order they first appear
// in the CVL response.
export const toAdditionalConditionGroups = (
  conditions: AdditionalLicenceConditionResponse[] = [],
): AdditionalConditionGroupsView => {
  const groups = new Map<string, ConditionGroupView>()
  const unknownCodes: string[] = []
  conditions.forEach(condition => {
    const { key, title, known } = groupOf(condition)
    if (key !== ELECTRONIC_MONITORING_GROUP_KEY && !groups.has(key)) groups.set(key, { key, title })
    if (!known) unknownCodes.push(condition.code ?? '(no code)')
  })
  return {
    groups: [...groups.values()],
    unknownCodes,
    hasUnshownElectronicMonitoring:
      conditions.some(isElectronicMonitoring) && !TAG_CONDITION_GROUP_KEYS.some(key => groups.has(key)),
  }
}

export type AdditionalConditionGroupView = ConditionGroupView & { conditions: NumberedConditionView[] }

// One group's page: its title and the person's conditions in it, numbered as on the licence document.
// A tag page also shows the general electronic monitoring condition, in its place in the response.
// Undefined when the person has no conditions in that group.
export const toAdditionalConditionGroup = (
  conditions: AdditionalLicenceConditionResponse[] | undefined,
  groupKey: string,
): AdditionalConditionGroupView | undefined => {
  const group = toAdditionalConditionGroups(conditions).groups.find(({ key }) => key === groupKey)
  if (!group) return undefined
  const isTagGroup = TAG_CONDITION_GROUP_KEYS.includes(groupKey)
  return {
    ...group,
    conditions: toNumberedAdditionalConditions(conditions).filter(
      c => c.groupKey === groupKey || (isTagGroup && c.groupKey === ELECTRONIC_MONITORING_GROUP_KEY),
    ),
  }
}

export const BESPOKE_CONDITIONS_KEY = 'bespoke-licence-conditions'

// The person's bespoke conditions page, or undefined when they have none. On the licence document they
// come after the additional conditions, each with its own number and no letter: the first is numbered
// one after the last additional condition category (see toNumberedAdditionalConditions).
export const toBespokeConditionGroup = (
  additional: AdditionalLicenceConditionResponse[] = [],
  bespoke: BespokeLicenceConditionResponse[] = [],
): AdditionalConditionGroupView | undefined => {
  const conditions = bespoke.filter(({ text }) => text?.trim())
  if (!conditions.length) return undefined
  const additionalCategoryCount = new Set(additional.map(({ category }) => category ?? '')).size
  return {
    key: BESPOKE_CONDITIONS_KEY,
    title: 'Bespoke licence conditions',
    conditions: conditions.map(({ text }, index) => ({
      groupKey: BESPOKE_CONDITIONS_KEY,
      number: additionalCategoryCount + index + 1,
      text,
    })),
  }
}

// Tag groups shown as "You need to wear [tagType] tag" on the licence page, with their tag type.
const TAG_TYPES: Record<string, string> = {
  'wear-a-gps-tag': 'a GPS',
  'wear-a-curfew-or-rf-tag': 'a curfew or radio frequency (RF)',
  'wear-an-alcohol-tag': 'an alcohol',
}

export type LicenceTagView = {
  tagType: string
  // ISO date (yyyy-MM-dd), when one could be found.
  endDate?: string
}

// NOTE: CVL doesn't give tag conditions an end date field yet, so we take it from the condition text,
// e.g. "...ending on Sunday 25 December 2033" or "...until Saturday 31 December 2033". This is fragile:
// if the wording changes, the date is just left out. A field for it has been requested in the API
// response; once it's there, use it instead and remove this.
const END_DATE_PATTERN =
  /\b(?:until|ending on)\s+(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day\s+)?(\d{1,2}\s+[a-z]+\s+\d{4})/gi

const endDateIn = (texts: (string | undefined)[]): string | undefined => {
  const dates = texts
    .flatMap(text => [...(text ?? '').matchAll(END_DATE_PATTERN)].map(match => match[1].replace(/\s+/g, ' ')))
    .map(date => parse(date, 'd MMMM yyyy', new Date()))
    .filter(isValid)
    .map(date => format(date, 'yyyy-MM-dd'))
    .sort()
  return dates[dates.length - 1]
}

// The person's tags for the licence page, one per tag group they have, in the order they come in the
// response. The end date is the latest date in the tag's own conditions or, if none of them has one,
// in the general electronic monitoring condition.
export const toLicenceTags = (conditions: AdditionalLicenceConditionResponse[] = []): LicenceTagView[] => {
  const electronicMonitoringEndDate = endDateIn(conditions.filter(isElectronicMonitoring).map(({ text }) => text))
  return toAdditionalConditionGroups(conditions)
    .groups.filter(({ key }) => TAG_TYPES[key])
    .map(({ key }) => ({
      tagType: TAG_TYPES[key],
      endDate:
        endDateIn(conditions.filter(condition => groupOf(condition).key === key).map(({ text }) => text)) ??
        electronicMonitoringEndDate,
    }))
}
