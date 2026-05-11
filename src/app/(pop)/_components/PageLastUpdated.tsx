export default function PageLastUpdated({ value }: { value?: string }) {
  if (!value) return null

  return <p className="govuk-body govuk-hint govuk-!-margin-top-0">Last updated on {value}</p>
}
