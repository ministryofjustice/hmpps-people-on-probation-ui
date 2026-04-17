'use client'

import GlobalChatbotWidget from './GlobalChatbotWidget'

export default function AppChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="govuk-header pop-app-header">
        <div className="govuk-header__container">
          <div className="govuk-header__branding">
            <a href="/" className="govuk-header__homepage-link pop-app-header__link">
              <span className="govuk-header__logo" aria-hidden="true" />
              <span className="pop-app-header__wordmark">
                <span className="pop-app-header__brand-gov">GOV</span>
                <span className="pop-app-header__brand-dot" aria-hidden="true">
                  .
                </span>
                <span className="pop-app-header__brand-uk">UK</span>
              </span>
            </a>
          </div>
        </div>
      </header>
      <div className="pop-app-service-strip">
        <div className="pop-app-service-strip__content">
          <div className="pop-app-service-strip__name">Manage your community sentence</div>
          <a href="#" className="govuk-link pop-app-service-strip__signout">
            Sign out
          </a>
        </div>
      </div>
      <div className="govuk-phase-banner">
        <p className="govuk-phase-banner__content">
          <span className="pop-app-phase-banner__inner">
            <strong className="govuk-tag govuk-phase-banner__content__tag">Prototype</strong>
            <span className="govuk-phase-banner__text">
              This is a new service - your <a className="govuk-link" href="#">feedback</a> will help us to improve it.
            </span>
          </span>
        </p>
      </div>
      {children}
      <GlobalChatbotWidget />
      <footer className="govuk-footer pop-app-footer">
        <div className="govuk-footer__container">
          <div className="pop-app-footer__left">
            <div className="pop-app-footer__left-icon" aria-hidden="true" />
            <div className="pop-app-footer__meta">
              <div className="pop-app-footer__links">
                <a href="#" className="govuk-footer__link govuk-link">
                  Privacy
                </a>
                <a href="#" className="govuk-footer__link govuk-link">
                  Cookies
                </a>
                <a href="#" className="govuk-footer__link govuk-link">
                  Accessibility statement
                </a>
              </div>
              <div className="pop-app-footer__licence">
                <span className="pop-app-footer__ogl">OGL</span>
                <span className="pop-app-footer__licence-text">
                  All content is available under the{' '}
                  <a href="#" className="govuk-footer__link govuk-link">
                    Open Government Licence v3.0
                  </a>
                  , except where otherwise stated
                </span>
              </div>
            </div>
          </div>
          <div className="pop-app-footer__copyright">
            <span className="pop-app-footer__crest" aria-hidden="true" />
            <a href="#" className="govuk-footer__link govuk-link">
              © Crown copyright
            </a>
          </div>
        </div>
      </footer>
    </>
  )
}
