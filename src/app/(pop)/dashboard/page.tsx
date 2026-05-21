import { redirect } from 'next/navigation'
import HomeCardGrid from '../_components/HomeCardGrid'
import ServiceUnavailable from '../_components/ServiceUnavailable'
import { defaultPopCrn, getPopDashboard, resolvePopCrn } from '@/lib/server/pop'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function Dashboard({
  searchParams,
}: {
  searchParams?: Promise<{ crn?: string | string[] | undefined }>
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const requestedCrn = typeof resolvedSearchParams?.crn === 'string' ? resolvedSearchParams.crn : undefined

  if (!requestedCrn?.trim()) {
    redirect(`/dashboard?crn=${encodeURIComponent(defaultPopCrn)}`)
  }

  const selectedCrn = resolvePopCrn(requestedCrn)
  const dashboard = await getPopDashboard(selectedCrn)
  if (!dashboard) {
    return <ServiceUnavailable />
  }

  return (
    <>
      <h1 className="govuk-heading-xl">Welcome, {dashboard.welcomeName}</h1>
      <HomeCardGrid
        crn={selectedCrn}
        cards={
          dashboard.cards || [
            {
              title: 'Your details',
              description: 'View your personal information',
              href: '/your-details',
            },
            {
              title: 'Your progress',
              description: 'Track your community order progress',
              href: '/your-progress',
            },
            {
              title: 'Your appointments',
              description: 'View your scheduled sessions',
              href: '/appointments',
            },
            {
              title: 'Your probation requirements',
              description: 'View the conditions of your order',
              href: '/conditions',
            },
          ]
        }
      />
    </>
  )
}
