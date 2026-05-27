import { dataAccess } from '../data'
import AuditService from './auditService'
import { getPeopleOnProbationService } from './peopleOnProbationService'

export const services = () => {
  const { applicationInfo, hmppsAuditClient } = dataAccess()

  return {
    applicationInfo,
    auditService: new AuditService(hmppsAuditClient),
    peopleOnProbationService: getPeopleOnProbationService(),
  }
}

export type Services = ReturnType<typeof services>
