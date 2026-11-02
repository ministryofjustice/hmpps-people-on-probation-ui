import { SpanKind, SpanStatusCode, type Attributes } from '@opentelemetry/api'
import type { SpanInfo } from '@ministryofjustice/hmpps-azure-telemetry'
import { filterSuccessfulIgnoredRequests, filterSuccessfulSqsDependencies } from './telemetryFilters'

const span = (kind: SpanKind, attributes: Attributes, status = SpanStatusCode.UNSET): SpanInfo => ({
  name: 'span',
  kind,
  attributes,
  durationMs: 1,
  status: { code: status },
})

describe('telemetryFilters', () => {
  describe('filterSuccessfulIgnoredRequests', () => {
    it.each([
      ['GET', '/assets/some.css', false],
      ['GET', '/health', false],
      ['GET', '/health/ping', false],
      ['GET', '/ping', false],
      ['GET', '/info', false],
      ['GET', '/something-else', true],
      ['GET', '/sandwich/health/with-something-else', true],
      ['POST', '/health', true],
    ])('%s %s with 200 is kept: %s', (method, path, kept) => {
      const request = span(SpanKind.SERVER, { 'http.method': method, 'http.target': path, 'http.status_code': 200 })
      expect(filterSuccessfulIgnoredRequests(request)).toBe(kept)
    })

    it('keeps successful outgoing calls to health endpoints', () => {
      const dependency = span(SpanKind.CLIENT, {
        'http.method': 'GET',
        'http.target': '/health/ping',
        'http.status_code': 200,
      })
      expect(filterSuccessfulIgnoredRequests(dependency)).toBe(true)
    })

    it('supports stable semantic convention attributes', () => {
      const request = span(SpanKind.SERVER, {
        'http.request.method': 'GET',
        'url.path': '/health',
        'http.response.status_code': 200,
      })
      expect(filterSuccessfulIgnoredRequests(request)).toBe(false)
    })

    it.each(['/assets/some.css', '/health', '/ping', '/info'])('GET %s is kept when it fails', path => {
      expect(
        filterSuccessfulIgnoredRequests(
          span(SpanKind.SERVER, { 'http.method': 'GET', 'http.target': path, 'http.status_code': 404 }),
        ),
      ).toBe(true)
      expect(
        filterSuccessfulIgnoredRequests(
          span(SpanKind.SERVER, { 'http.method': 'GET', 'http.target': path }, SpanStatusCode.ERROR),
        ),
      ).toBe(true)
    })
  })

  describe('filterSuccessfulSqsDependencies', () => {
    it.each([
      ['sqs.eu-west-2.amazonaws.com', false],
      ['sqs.us-east-1.amazonaws.com', false],
      ['anything.else', true],
    ])('successful call to %s is kept: %s', (host, kept) => {
      const dependency = span(SpanKind.CLIENT, { 'net.peer.name': host, 'http.status_code': 200 })
      expect(filterSuccessfulSqsDependencies(dependency)).toBe(kept)
    })

    it('keeps failed calls to SQS', () => {
      const dependency = span(
        SpanKind.CLIENT,
        { 'server.address': 'sqs.eu-west-2.amazonaws.com' },
        SpanStatusCode.ERROR,
      )
      expect(filterSuccessfulSqsDependencies(dependency)).toBe(true)
    })

    it('ignores non-client spans', () => {
      expect(filterSuccessfulSqsDependencies(span(SpanKind.SERVER, { 'net.peer.name': 'sqs.eu-west-2' }))).toBe(true)
    })
  })
})
