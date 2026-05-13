import { requireCurrentUser } from '@/lib/server/auth/currentUser'
import AppChrome from './_components/AppChrome'

export const metadata = {
  title: 'Probation account',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await requireCurrentUser()

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
