import { dataAccess } from '../data'
import AuditService from './auditService'
import { getPeopleOnProbationService } from './peopleOnProbationService'
import config from '../config'

export const services = () => {
  const { applicationInfo } = dataAccess()

  return {
    applicationInfo,
    auditService: config.sqs.audit.enabled ? new AuditService() : undefined,
    peopleOnProbationService: getPeopleOnProbationService(),
  }
}

export type Services = ReturnType<typeof services>
