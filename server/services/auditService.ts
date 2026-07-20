import { auditService as hmppsAuditService } from '@ministryofjustice/hmpps-audit-client'
import config from '../config'

export enum Page {
  EXAMPLE_PAGE = 'EXAMPLE_PAGE',
}

export enum AuditAction {
  USER_REGISTERED = 'USER_REGISTERED',
  USER_SIGNED_IN = 'USER_SIGNED_IN',
  USER_REGISTRATION_ATTEMPTED = 'USER_REGISTRATION_ATTEMPTED',
  USER_REGISTRATION_FAILED = 'USER_REGISTRATION_FAILED',
  USER_SIGN_IN_ATTEMPTED = 'USER_SIGN_IN_ATTEMPTED',
  USER_SIGN_IN_FAILED = 'USER_SIGN_IN_FAILED',
  ADMIN_PREVIEW_SEARCH_ATTEMPTED = 'ADMIN_PREVIEW_SEARCH_ATTEMPTED',
  ADMIN_PREVIEW_STARTED = 'ADMIN_PREVIEW_STARTED',
  ADMIN_PREVIEW_ENDED = 'ADMIN_PREVIEW_ENDED',
}

export interface AuditEvent {
  action: string
  who: string
  subjectId?: string
  subjectType?: string
  correlationId?: string
  details?: object
}

export interface PageViewEventDetails {
  who: string
  subjectId?: string
  subjectType?: string
  correlationId?: string
  details?: object
}

export default class AuditService {
  async logAuditEvent(event: AuditEvent) {
    try {
      await hmppsAuditService.sendAuditMessage({
        ...event,
        service: config.sqs.audit.serviceName,
        details: event.details ? JSON.stringify(event.details) : undefined,
        logErrors: true,
      })
    } catch (cause) {
      const message =
        cause instanceof Error && cause.message
          ? cause.message
          : JSON.stringify(cause, Object.getOwnPropertyNames(cause))
      throw new Error(`Audit SQS send failed for action '${event.action}': ${message}`, { cause })
    }
  }

  async logPageView(page: Page, eventDetails: PageViewEventDetails) {
    const event: AuditEvent = {
      ...eventDetails,
      action: `PAGE_VIEW_${page}`,
    }
    await this.logAuditEvent(event)
  }

  async logUserRegistered(eventDetails: Omit<AuditEvent, 'action' | 'subjectType'>) {
    await this.logAuditEvent({
      ...eventDetails,
      action: AuditAction.USER_REGISTERED,
      subjectType: 'CRN',
    })
  }

  async logUserSignedIn(eventDetails: Omit<AuditEvent, 'action' | 'subjectType'>) {
    await this.logAuditEvent({
      ...eventDetails,
      action: AuditAction.USER_SIGNED_IN,
      subjectType: 'CRN',
    })
  }

  async logUserRegistrationAttempt(eventDetails: Omit<AuditEvent, 'action'>) {
    await this.logAuditEvent({
      ...eventDetails,
      action: AuditAction.USER_REGISTRATION_ATTEMPTED,
    })
  }

  async logUserRegistrationFailure(eventDetails: Omit<AuditEvent, 'action'>) {
    await this.logAuditEvent({
      ...eventDetails,
      action: AuditAction.USER_REGISTRATION_FAILED,
    })
  }

  async logUserSignInAttempt(eventDetails: Omit<AuditEvent, 'action'>) {
    await this.logAuditEvent({
      ...eventDetails,
      action: AuditAction.USER_SIGN_IN_ATTEMPTED,
    })
  }

  async logUserSignInFailure(eventDetails: Omit<AuditEvent, 'action'>) {
    await this.logAuditEvent({
      ...eventDetails,
      action: AuditAction.USER_SIGN_IN_FAILED,
    })
  }

  // Admin "preview as user" feature (server/routes/admin.ts) — who is the
  // admin's own HMPPS Auth username, subjectId is the CRN being
  // searched/previewed.
  async logAdminPreviewSearchAttempt(eventDetails: Omit<AuditEvent, 'action' | 'subjectType'>) {
    await this.logAuditEvent({
      ...eventDetails,
      action: AuditAction.ADMIN_PREVIEW_SEARCH_ATTEMPTED,
      subjectType: 'CRN',
    })
  }

  async logAdminPreviewStarted(eventDetails: Omit<AuditEvent, 'action' | 'subjectType'>) {
    await this.logAuditEvent({
      ...eventDetails,
      action: AuditAction.ADMIN_PREVIEW_STARTED,
      subjectType: 'CRN',
    })
  }

  async logAdminPreviewEnded(eventDetails: Omit<AuditEvent, 'action' | 'subjectType'>) {
    await this.logAuditEvent({
      ...eventDetails,
      action: AuditAction.ADMIN_PREVIEW_ENDED,
      subjectType: 'CRN',
    })
  }
}
