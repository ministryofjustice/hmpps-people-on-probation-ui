import { redirect } from 'next/navigation'
import ServiceUnavailable from './_components/ServiceUnavailable'
import { defaultPopCrn, getPopDashboard, resolvePopCrn, withCrn } from '@/lib/server/pop'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function PopHome({
  searchParams,
}: {
  searchParams?: Promise<{ crn?: string | string[] | undefined }>
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const requestedCrn = typeof resolvedSearchParams?.crn === 'string' ? resolvedSearchParams.crn : undefined

  if (!requestedCrn?.trim()) {
    redirect(`/?crn=${encodeURIComponent(defaultPopCrn)}`)
  }

  const selectedCrn = resolvePopCrn(requestedCrn)
  const dashboard = await getPopDashboard(selectedCrn)
  if (!dashboard) {
    return <ServiceUnavailable />
  }

  return (
    <>
      <h1 className="govuk-heading-xl">Welcome, {dashboard.welcomeName}</h1>
      <div className="govuk-card-grid">
        {(dashboard.cards || [
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
            title: 'Past and upcoming appointments',
            description: 'View your scheduled sessions',
            href: '/appointments',
          },
          {
            title: 'Your conditions',
            description: 'View the conditions of your order',
            href: '/conditions',
          },
        ]).map(card => (
          <a key={card.title} className="govuk-card-link" href={withCrn(card.href, selectedCrn)}>
            <h2 className="govuk-card-link__title">{card.title}</h2>
            <p className="govuk-card-link__description">{card.description}</p>
          </a>
        ))}
      </div>
    </>
  )
}
