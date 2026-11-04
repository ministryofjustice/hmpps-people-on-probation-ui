// Main category codes (RequirementResponse/LicenceConditionResponse.mainCategory.code)
// for the individual electronic-monitoring (tag) requirement types.
export const GPS_TAG_CATEGORY_CODE = 'RM59'
export const CURFEW_CATEGORY_CODE = 'RM49'
export const ALCOHOL_TAG_CATEGORY_CODE = 'T'

// All tag-related main category codes together - used where any tag type is
// treated the same way, e.g. the appointments page's "why this might happen" guidance.
export const TAG_CATEGORY_CODES = [GPS_TAG_CATEGORY_CODE, CURFEW_CATEGORY_CODE, ALCOHOL_TAG_CATEGORY_CODE]

// Main category codes for requirements whose appointments are arranged by other providers (e.g.
// treatment services, programme providers), so may not appear in the appointments list. Any of these
// shows the "Appointments outside the Probation Service" line in the appointments page's "Why this
// might happen" guidance.
// Q Specified Activity, G Drug Rehabilitation, H Alcohol Treatment, P Mental Health Treatment,
// E Drug Testing (YRO), I Intoxicating Substance Treatment (YRO), RM38 RAR/GAR Accredited Programmes,
// 7 Court - Accredited Programme, F Rehabilitation Activity Requirement (RAR).
export const OTHER_CHANNEL_CATEGORY_CODES = ['Q', 'G', 'H', 'P', 'E', 'I', 'RM38', '7', 'F']

// Main category code that identifies an unpaid work (Community Payback) requirement.
export const UNPAID_WORK_CATEGORY_CODE = 'W'

// Main category code that identifies a Rehabilitation Activity Requirement (RAR).
export const RAR_CATEGORY_CODE = 'F'

// Main category code that identifies a Prohibited Activity requirement.
export const PROHIBITED_ACTIVITY_CATEGORY_CODE = 'R'

// Main category code 'RAR' (not 'F', the Rehabilitation Activity Requirement itself) is a requirement
// created in MPOP (Manage People on Probation) for administration only. It isn't something the person
// has to do, so it's filtered out and never shown to them.
export const ADMINISTRATIVE_RAR_CATEGORY_CODE = 'RAR'
