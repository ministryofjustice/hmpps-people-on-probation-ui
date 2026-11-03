import type { SanitisedError } from '@ministryofjustice/hmpps-rest-client'
import type { Services } from '../services'
import type { LicenceResponse, LicenceSummaryResponse } from '../data/peopleOnProbationApiClient'

const isNotFound = (error: unknown) => (error as SanitisedError | undefined)?.responseStatus === 404

// The person's current licence from CVL. The API only returns active licences; if there's more than one,
// the most recently updated is used. Undefined when they don't have one yet.
export default async function findCurrentLicence(
  services: Services,
  crn: string,
): Promise<LicenceResponse | undefined> {
  const { peopleOnProbationService } = services
  let summaries: LicenceSummaryResponse[]
  try {
    summaries = await peopleOnProbationService.getLicences(crn)
  } catch (error) {
    if (isNotFound(error)) return undefined
    throw error
  }
  const [latest] = [...(summaries ?? [])].sort((a, b) =>
    (b.updatedDateTime ?? b.approvedDateTime ?? '').localeCompare(a.updatedDateTime ?? a.approvedDateTime ?? ''),
  )
  return latest ? peopleOnProbationService.getLicence(crn, latest.id) : undefined
}
