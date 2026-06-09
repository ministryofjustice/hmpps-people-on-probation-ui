import { dataAccess } from '../data'
import AuditService from './auditService'
import { getPeopleOnProbationService } from './peopleOnProbationService'

export const services = () => {
  const { applicationInfo } = dataAccess()

  return {
    applicationInfo,
    auditService: new AuditService(),
    peopleOnProbationService: getPeopleOnProbationService(),
  }
}

export type Services = ReturnType<typeof services>
