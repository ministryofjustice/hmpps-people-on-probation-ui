import {
  ALCOHOL_TAG_CATEGORY_CODE,
  CURFEW_CATEGORY_CODE,
  GPS_TAG_CATEGORY_CODE,
  PROHIBITED_ACTIVITY_CATEGORY_CODE,
  RAR_CATEGORY_CODE,
  UNPAID_WORK_CATEGORY_CODE,
} from './categoryCodes'

// The requirement types we show with a user-friendly label, keyed by nDelius main category code.
// Codes not listed here are shown under their nDelius description, with no explanation.
//
// To add a type: add an entry below. To give it a "What this means" explanation, add
// views/partials/requirement-explanations/<kind>.njk and set hasExplanation: true. To give it a
// "Help with this requirement" panel, add views/partials/requirement-help/<kind>.njk and set
// hasHelp: true.

export type RequirementKind =
  | 'gps-tag'
  | 'alcohol-tag'
  | 'curfew'
  | 'unpaid-work'
  | 'rar'
  | 'prohibited-activity'
  | 'programme'
  | 'mental-health'
  | 'drug-use'
  | 'alcohol-use'
  | 'exclusion'
  | 'residence'

export type RequirementType = {
  kind: RequirementKind
  label: string
  codes: string[]
  // Show "Where to find details" pointing to the court order, for requirements whose details
  // (places, times, people) are only set out there.
  showCourtOrderSignpost: boolean
  hasExplanation: boolean
  hasHelp?: boolean
  // Progress is counted (hours or days done one at a time), so a missing completed amount means none
  // done yet, rather than falling back to the dates. See toRequirementView.
  countsProgress?: boolean
}

export const REQUIREMENT_TYPES: RequirementType[] = [
  {
    kind: 'gps-tag',
    label: 'Wear a GPS tag',
    codes: [GPS_TAG_CATEGORY_CODE],
    showCourtOrderSignpost: true,
    hasExplanation: true,
    hasHelp: true,
  },
  {
    kind: 'alcohol-tag',
    label: 'Wear an alcohol tag',
    // Alcohol Abstinence & Electronic Monitoring (AAMR)
    codes: [ALCOHOL_TAG_CATEGORY_CODE],
    showCourtOrderSignpost: true,
    hasExplanation: true,
    hasHelp: true,
  },
  {
    kind: 'curfew',
    label: 'Follow a curfew',
    codes: [CURFEW_CATEGORY_CODE],
    showCourtOrderSignpost: true,
    hasExplanation: true,
    hasHelp: true,
  },
  {
    kind: 'unpaid-work',
    label: 'Community payback (unpaid work)',
    codes: [UNPAID_WORK_CATEGORY_CODE],
    showCourtOrderSignpost: false,
    hasExplanation: true,
    hasHelp: true,
    countsProgress: true,
  },
  {
    kind: 'rar',
    label: 'Rehabilitation Activity Requirement (RAR)',
    codes: [RAR_CATEGORY_CODE],
    showCourtOrderSignpost: false,
    hasExplanation: true,
    countsProgress: true,
  },
  {
    kind: 'prohibited-activity',
    label: 'Things you are not allowed to do',
    codes: [PROHIBITED_ACTIVITY_CATEGORY_CODE],
    showCourtOrderSignpost: true,
    hasExplanation: true,
    hasHelp: true,
  },
  {
    kind: 'programme',
    label: 'Programme requirement',
    // RAR/GAR Accredited Programmes; Court - Accredited Programme
    codes: ['RM38', '7'],
    showCourtOrderSignpost: false,
    hasExplanation: true,
  },
  {
    kind: 'mental-health',
    label: 'Address your mental health',
    // Mental Health Treatment
    codes: ['P'],
    showCourtOrderSignpost: false,
    hasExplanation: true,
  },
  {
    kind: 'drug-use',
    label: 'Address drug use',
    // Drug Rehabilitation
    codes: ['G'],
    showCourtOrderSignpost: false,
    hasExplanation: true,
  },
  {
    kind: 'alcohol-use',
    label: 'Address alcohol use',
    // Alcohol Treatment
    codes: ['H'],
    showCourtOrderSignpost: false,
    hasExplanation: true,
  },
  {
    kind: 'exclusion',
    label: 'Areas or places you must not enter',
    // Exclusion
    codes: ['X'],
    showCourtOrderSignpost: true,
    hasExplanation: true,
    hasHelp: true,
  },
  {
    kind: 'residence',
    label: 'Address you must live in',
    // Residential
    codes: ['3'],
    showCourtOrderSignpost: true,
    hasExplanation: true,
    hasHelp: true,
  },
]

const TYPE_BY_CODE = new Map(REQUIREMENT_TYPES.flatMap(type => type.codes.map(code => [code, type] as const)))

// Tag requirements, in the order the curfew explanation picks one to link to.
export const TAG_REQUIREMENT_KINDS: RequirementKind[] = ['gps-tag', 'alcohol-tag']

export const getRequirementType = (code?: string): RequirementType | undefined =>
  code ? TYPE_BY_CODE.get(code) : undefined

export const explanationTemplate = (type?: RequirementType): string | undefined =>
  type?.hasExplanation ? `partials/requirement-explanations/${type.kind}.njk` : undefined

export const helpTemplate = (type?: RequirementType): string | undefined =>
  type?.hasHelp ? `partials/requirement-help/${type.kind}.njk` : undefined
