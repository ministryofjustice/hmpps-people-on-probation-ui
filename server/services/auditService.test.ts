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
        logErrors: true,
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
        logErrors: true,
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
        logErrors: true,
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
        logErrors: true,
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
        logErrors: true,
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
        logErrors: true,
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
        logErrors: true,
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
        logErrors: true,
      })
    })
  })

  describe('logAdminPreviewSearchAttempt', () => {
    it('sends admin preview search attempt audit message', async () => {
      await auditService.logAdminPreviewSearchAttempt({
        who: 'admin1',
        subjectId: 'X123456',
        correlationId: 'request123',
        details: { outcome: 'found' },
      })

      expect(mockedHmppsAuditService.sendAuditMessage).toHaveBeenCalledWith({
        action: AuditAction.ADMIN_PREVIEW_SEARCH_ATTEMPTED,
        who: 'admin1',
        subjectId: 'X123456',
        subjectType: 'CRN',
        correlationId: 'request123',
        service: 'hmpps-probation-accounts',
        details: JSON.stringify({ outcome: 'found' }),
        logErrors: true,
      })
    })
  })

  describe('logAdminPreviewStarted', () => {
    it('sends admin preview started audit message', async () => {
      await auditService.logAdminPreviewStarted({
        who: 'admin1',
        subjectId: 'X123456',
        correlationId: 'request123',
      })

      expect(mockedHmppsAuditService.sendAuditMessage).toHaveBeenCalledWith({
        action: AuditAction.ADMIN_PREVIEW_STARTED,
        who: 'admin1',
        subjectId: 'X123456',
        subjectType: 'CRN',
        correlationId: 'request123',
        service: 'hmpps-probation-accounts',
        details: undefined,
        logErrors: true,
      })
    })
  })

  describe('logAdminPreviewEnded', () => {
    it('sends admin preview ended audit message', async () => {
      await auditService.logAdminPreviewEnded({
        who: 'admin1',
        subjectId: 'X123456',
        correlationId: 'request123',
      })

      expect(mockedHmppsAuditService.sendAuditMessage).toHaveBeenCalledWith({
        action: AuditAction.ADMIN_PREVIEW_ENDED,
        who: 'admin1',
        subjectId: 'X123456',
        subjectType: 'CRN',
        correlationId: 'request123',
        service: 'hmpps-probation-accounts',
        details: undefined,
        logErrors: true,
      })
    })
  })
})
