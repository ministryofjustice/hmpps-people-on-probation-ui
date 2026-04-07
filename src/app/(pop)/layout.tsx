import AppChrome from './_components/AppChrome'

export const metadata = {
  title: 'Manage my community sentence',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppChrome>
      <div className="govuk-width-container pop-app-width-container">
        <main className="govuk-main-wrapper app-container govuk-body" id="main-content">
          {children}
        </main>
      </div>
    </AppChrome>
  )
}
