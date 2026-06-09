import { auditService as hmppsAuditService } from '@ministryofjustice/hmpps-audit-client'
import AuditService, { AuditAction, Page } from './auditService'

jest.mock('@ministryofjustice/hmpps-audit-client', () => ({
  auditService: {
    sendAuditMessage: jest.fn(),
  },
}))

describe('Audit service', () => {
  let auditService: AuditService
  const mockedHmppsAuditService = hmppsAuditService as jest.Mocked<typeof hmppsAuditService>

  beforeEach(() => {
    auditService = new AuditService()
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('logAuditEvent', () => {
    it('sends audit message using audit client', async () => {
      await auditService.logAuditEvent({
        action: 'AUDIT_EVENT',
        who: 'user1',
        subjectId: 'subject123',
        subjectType: 'exampleType',
        correlationId: 'request123',
        details: { extraDetails: 'example' },
      })

      expect(mockedHmppsAuditService.sendAuditMessage).toHaveBeenCalledWith({
        action: 'AUDIT_EVENT',
        who: 'user1',
        subjectId: 'subject123',
        subjectType: 'exampleType',
        correlationId: 'request123',
        service: 'hmpps-probation-accounts',
        details: JSON.stringify({ extraDetails: 'example' }),
        logErrors: false,
      })
    })
  })

  describe('logPageView', () => {
    it('sends page view event audit message using audit client', async () => {
      await auditService.logPageView(Page.EXAMPLE_PAGE, {
        who: 'user1',
        subjectId: 'subject123',
        subjectType: 'exampleType',
        correlationId: 'request123',
        details: { extraDetails: 'example' },
      })

      expect(mockedHmppsAuditService.sendAuditMessage).toHaveBeenCalledWith({
        action: 'PAGE_VIEW_EXAMPLE_PAGE',
        who: 'user1',
        subjectId: 'subject123',
        subjectType: 'exampleType',
        correlationId: 'request123',
        service: 'hmpps-probation-accounts',
        details: JSON.stringify({ extraDetails: 'example' }),
        logErrors: false,
      })
    })
  })

  describe('logUserRegistered', () => {
    it('sends user registration audit message', async () => {
      await auditService.logUserRegistered({
        who: 'one-login-subject',
        subjectId: 'X123456',
        correlationId: 'request123',
      })

      expect(mockedHmppsAuditService.sendAuditMessage).toHaveBeenCalledWith({
        action: AuditAction.USER_REGISTERED,
        who: 'one-login-subject',
        subjectId: 'X123456',
        subjectType: 'CRN',
        correlationId: 'request123',
        service: 'hmpps-probation-accounts',
        details: undefined,
        logErrors: false,
      })
    })
  })

  describe('logUserSignedIn', () => {
    it('sends user sign in audit message', async () => {
      await auditService.logUserSignedIn({
        who: 'one-login-subject',
        subjectId: 'X123456',
        correlationId: 'request123',
      })

      expect(mockedHmppsAuditService.sendAuditMessage).toHaveBeenCalledWith({
        action: AuditAction.USER_SIGNED_IN,
        who: 'one-login-subject',
        subjectId: 'X123456',
        subjectType: 'CRN',
        correlationId: 'request123',
        service: 'hmpps-probation-accounts',
        details: undefined,
        logErrors: false,
      })
    })
  })

  describe('logUserRegistrationAttempt', () => {
    it('sends user registration attempt audit message', async () => {
      await auditService.logUserRegistrationAttempt({
        who: 'one-login-subject',
        subjectId: 'one-login-subject',
        subjectType: 'ONE_LOGIN_SUBJECT',
        correlationId: 'request123',
        details: { attemptedAt: '2026-06-07T10:00:00.000Z' },
      })

      expect(mockedHmppsAuditService.sendAuditMessage).toHaveBeenCalledWith({
        action: AuditAction.USER_REGISTRATION_ATTEMPTED,
        who: 'one-login-subject',
        subjectId: 'one-login-subject',
        subjectType: 'ONE_LOGIN_SUBJECT',
        correlationId: 'request123',
        service: 'hmpps-probation-accounts',
        details: JSON.stringify({ attemptedAt: '2026-06-07T10:00:00.000Z' }),
        logErrors: false,
      })
    })
  })

  describe('logUserRegistrationFailure', () => {
    it('sends user registration failure audit message', async () => {
      await auditService.logUserRegistrationFailure({
        who: 'one-login-subject',
        subjectId: 'one-login-subject',
        subjectType: 'ONE_LOGIN_SUBJECT',
        correlationId: 'request123',
        details: { failedAt: '2026-06-07T10:00:00.000Z', reason: 'registration_invite_validation_failed' },
      })

      expect(mockedHmppsAuditService.sendAuditMessage).toHaveBeenCalledWith({
        action: AuditAction.USER_REGISTRATION_FAILED,
        who: 'one-login-subject',
        subjectId: 'one-login-subject',
        subjectType: 'ONE_LOGIN_SUBJECT',
        correlationId: 'request123',
        service: 'hmpps-probation-accounts',
        details: JSON.stringify({
          failedAt: '2026-06-07T10:00:00.000Z',
          reason: 'registration_invite_validation_failed',
        }),
        logErrors: false,
      })
    })
  })

  describe('logUserSignInAttempt', () => {
    it('sends user sign in attempt audit message', async () => {
      await auditService.logUserSignInAttempt({
        who: 'one-login-subject',
        subjectId: 'one-login-subject',
        subjectType: 'ONE_LOGIN_SUBJECT',
        correlationId: 'request123',
        details: { attemptedAt: '2026-06-07T10:00:00.000Z' },
      })

      expect(mockedHmppsAuditService.sendAuditMessage).toHaveBeenCalledWith({
        action: AuditAction.USER_SIGN_IN_ATTEMPTED,
        who: 'one-login-subject',
        subjectId: 'one-login-subject',
        subjectType: 'ONE_LOGIN_SUBJECT',
        correlationId: 'request123',
        service: 'hmpps-probation-accounts',
        details: JSON.stringify({ attemptedAt: '2026-06-07T10:00:00.000Z' }),
        logErrors: false,
      })
    })
  })

  describe('logUserSignInFailure', () => {
    it('sends user sign in failure audit message', async () => {
      await auditService.logUserSignInFailure({
        who: 'one-login-subject',
        subjectId: 'one-login-subject',
        subjectType: 'ONE_LOGIN_SUBJECT',
        correlationId: 'request123',
        details: { failedAt: '2026-06-07T10:00:00.000Z', reason: 'registered_user_details_failed' },
      })

      expect(mockedHmppsAuditService.sendAuditMessage).toHaveBeenCalledWith({
        action: AuditAction.USER_SIGN_IN_FAILED,
        who: 'one-login-subject',
        subjectId: 'one-login-subject',
        subjectType: 'ONE_LOGIN_SUBJECT',
        correlationId: 'request123',
        service: 'hmpps-probation-accounts',
        details: JSON.stringify({
          failedAt: '2026-06-07T10:00:00.000Z',
          reason: 'registered_user_details_failed',
        }),
        logErrors: false,
      })
    })
  })
})
