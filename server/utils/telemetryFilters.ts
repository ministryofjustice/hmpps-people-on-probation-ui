import { SpanKind, SpanStatusCode } from '@opentelemetry/api'
import { telemetry, type SpanFilterFn, type SpanInfo } from '@ministryofjustice/hmpps-azure-telemetry'

// Instrumentation emits the old semantic-convention attribute names by default,
// so check both the old and stable names.
const attribute = (span: SpanInfo, ...keys: string[]) => keys.map(key => span.attributes[key]).find(v => v != null)

const isFailure = (span: SpanInfo) => {
  const statusCode = Number(attribute(span, 'http.response.status_code', 'http.status_code') ?? 0)
  return span.status.code === SpanStatusCode.ERROR || statusCode >= 400
}

/** Wraps a filter so that failed spans are always kept. */
export const keepFailures =
  (filter: SpanFilterFn): SpanFilterFn =>
  span =>
    isFailure(span) || filter(span)

const ignoredGetPaths = telemetry.processors.filterSpanWherePath(['/assets/*', '/health*', '/ping*', '/info*'])

/** Drops successful incoming GET requests for assets, health, ping and info. */
export const filterSuccessfulIgnoredRequests: SpanFilterFn = keepFailures(
  span =>
    span.kind !== SpanKind.SERVER ||
    attribute(span, 'http.request.method', 'http.method') !== 'GET' ||
    ignoredGetPaths(span),
)

/** Drops successful outgoing calls to SQS (e.g. audit events). */
export const filterSuccessfulSqsDependencies: SpanFilterFn = keepFailures(span => {
  if (span.kind !== SpanKind.CLIENT) return true
  const host = String(attribute(span, 'server.address', 'net.peer.name') ?? '')
  return !host.startsWith('sqs')
})
