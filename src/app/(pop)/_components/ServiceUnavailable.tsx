type ServiceUnavailableProps = {
  title?: string
  body?: string
}

export default function ServiceUnavailable({
  title = 'Service temporarily unavailable',
  body = 'We cannot load this information right now. Try again later or contact your probation practitioner if the problem continues.',
}: ServiceUnavailableProps) {
  return (
    <div className="govuk-inset-text">
      <h2 className="govuk-heading-m">{title}</h2>
      <p className="govuk-body govuk-!-margin-bottom-0">{body}</p>
    </div>
  )
}
