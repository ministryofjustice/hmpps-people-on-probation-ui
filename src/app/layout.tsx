import type { Metadata } from 'next'
import './globals.css'
import './app.scss'

export const metadata: Metadata = {
  title: 'HMPPS People On Probation Ui',
  description: 'HMPPS People On Probation Ui',
  icons: {
    icon: '/generated/favicon.ico',
  },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="/generated/vendor/govuk/govuk-frontend.min.css" />
        <link rel="stylesheet" href="/generated/vendor/moj/moj-frontend.min.css" />
      </head>
      <body className="js-enabled govuk-frontend-supported" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
