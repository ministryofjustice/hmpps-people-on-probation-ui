import type { SanitisedError } from '@ministryofjustice/hmpps-rest-client'
import type { Services } from '../services'
import type { LicenceResponse, LicenceSummaryResponse } from '../data/peopleOnProbationApiClient'

const isNotFound = (error: unknown) => (error as SanitisedError | undefined)?.responseStatus === 404

// The summary of the person's current licence from CVL. The API only returns active licences; if
// there's more than one, the most recently updated is used. Undefined when they don't have one yet.
export async function findCurrentLicenceSummary(
  services: Services,
  crn: string,
): Promise<LicenceSummaryResponse | undefined> {
  let summaries: LicenceSummaryResponse[]
  try {
    summaries = await services.peopleOnProbationService.getLicences(crn)
  } catch (error) {
    if (isNotFound(error)) return undefined
    throw error
  }
  return [...(summaries ?? [])].sort((a, b) =>
    (b.updatedDateTime ?? b.approvedDateTime ?? '').localeCompare(a.updatedDateTime ?? a.approvedDateTime ?? ''),
  )[0]
}

// Whether the person's current licence is for an indeterminate sentence (such as life), which has no end
// date. From Prisoner Search, via the licence summary; false when it isn't known.
export const hasIndeterminateSentence = async (services: Services, crn: string): Promise<boolean> =>
  (await findCurrentLicenceSummary(services, crn))?.indeterminateSentence === true

// The person's current licence from CVL (see findCurrentLicenceSummary), with whether its sentence is
// indeterminate, which only the summary has. Undefined when they don't have one yet, including when the
// licence stops being active between the two calls (the API then returns 404 for it).
export default async function findCurrentLicence(
  services: Services,
  crn: string,
): Promise<(LicenceResponse & Pick<LicenceSummaryResponse, 'indeterminateSentence'>) | undefined> {
  const summary = await findCurrentLicenceSummary(services, crn)
  if (!summary) return undefined
  try {
    const licence = await services.peopleOnProbationService.getLicence(crn, summary.id)
    return licence && { ...licence, indeterminateSentence: summary.indeterminateSentence }
  } catch (error) {
    if (isNotFound(error)) return undefined
    throw error
  }
}
