import PublicChrome from './_components/PublicChrome'

export const metadata = {
  title: 'Start using your probation account',
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <PublicChrome>
      <div className="govuk-width-container pop-app-width-container">
        <main className="govuk-main-wrapper app-container govuk-body" id="main-content">
          {children}
        </main>
      </div>
    </PublicChrome>
  )
}
