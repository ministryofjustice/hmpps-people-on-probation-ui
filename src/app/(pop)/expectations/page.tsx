import { resolvePopCrn, withCrn } from '@/lib/server/pop'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const expectationItems = [
  'Work with your Probation Practitioner and participate in activities laid out in your Court Order or licence. Dependant on your requirements, this may include attending groups, completing unpaid work or working with partner agencies.',
  'Treat staff and other people on Probation in a fair and respectful manner by not attending under the influence of alcohol / illicit drugs, and not using offensive, discriminatory, abusive, threatening, aggressive or violent words/behaviour in any Probation appointment or activity. Doing this may result in you being sent home and/or enforcement action being undertaken.',
  'Engage with your sentence plan, reviews of progress, and wider support, and talk about areas of your life which can help you avoid further offending. The more you engage with us, the more you will get out of it.',
  'Respect the privacy of others and not attempt to, or make any photographic, video or audio recordings when attending Probation appointments.',
  'Notify the Probation Service of any changes to contact details including telephone number within one working day, so that we are always able to contact you.',
  'Seek permission from your Probation Practitioner before any change of address and wait for their approval before moving.',
  'If you become homeless or have no fixed abode, you must keep in touch with Probation and contact them as often as instructed.',
  'Allow Probation staff to visit your home, to support effective sentence planning, sentence delivery and/or for public protection.',
  'Be on time for appointments and carry out all reasonable instructions given',
  'Notify us as far in advance as possible if you know you will be unable to attend a scheduled appointment',
  'If you are unable to provide evidence of why you cannot attend an appointment before it takes place, you must provide evidence within five working days of the failure to attend.',
]

export default async function ExpectationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ crn?: string | string[] | undefined }>
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const selectedCrn = resolvePopCrn(
    typeof resolvedSearchParams?.crn === 'string' ? resolvedSearchParams.crn : undefined,
  )

  return (
    <>
      <a className="govuk-back-link" href={withCrn('/', selectedCrn)}>
        Back
      </a>

      <h1 className="govuk-heading-xl">Probation service</h1>

      <p className="govuk-body">
        We will work with you to develop your &apos;sentence plan&apos; — this will set out goals and objectives to
        help you avoid further offending and make positive changes to your life. This sentence plan will shape what
        you work on, who with and when. Your plan will be reviewed with you to reflect progress and changes you make.
      </p>

      <h2 className="govuk-heading-s">We expect you to:</h2>
      <ul className="govuk-list govuk-list--bullet">
        {expectationItems.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <h2 className="govuk-heading-s govuk-!-margin-top-7">Need help understanding your conditions?</h2>
      <p className="govuk-body">
        Contact your probation practitioner for guidance on any conditions you are unsure about.
      </p>

      <a className="govuk-button" href="#">
        Launch chatbot
      </a>
    </>
  )
}
