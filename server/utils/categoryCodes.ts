// Main category codes (RequirementResponse/LicenceConditionResponse.mainCategory.code)
// for the individual electronic-monitoring (tag) requirement types.
export const GPS_TAG_CATEGORY_CODE = 'RM59'
export const CURFEW_CATEGORY_CODE = 'RM49'
export const ALCOHOL_TAG_CATEGORY_CODE = 'T'

// All tag-related main category codes together - used where any tag type is
// treated the same way, e.g. the appointments page's "why this might happen" guidance.
export const TAG_CATEGORY_CODES = [GPS_TAG_CATEGORY_CODE, CURFEW_CATEGORY_CODE, ALCOHOL_TAG_CATEGORY_CODE]

// Main category codes that determine which "why this might happen" guidance
// applies on the appointments page when the appointment isn't a tag appointment.
export const OTHER_CHANNEL_CATEGORY_CODES = ['Q', 'G', 'H', 'P', 'E', 'I', 'RM38', 'RM37']

// Main category code that identifies an unpaid work (Community Payback) requirement.
export const UNPAID_WORK_CATEGORY_CODE = 'W'

// Main category code that identifies a Rehabilitation Activity Requirement (RAR).
export const RAR_CATEGORY_CODE = 'F'
