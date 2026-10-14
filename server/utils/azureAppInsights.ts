// Must be imported before any other module so OpenTelemetry can instrument http, express and bunyan.
import { initialiseTelemetry, flushTelemetry, telemetry } from '@ministryofjustice/hmpps-azure-telemetry'
import { filterSuccessfulIgnoredRequests, filterSuccessfulSqsDependencies } from './telemetryFilters'

initialiseTelemetry({
  serviceName: 'hmpps-people-on-probation-ui',
  serviceVersion: process.env.BUILD_NUMBER || 'unknown',
  connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
  debug: process.env.DEBUG_TELEMETRY === 'true',
})
  .addFilter(filterSuccessfulIgnoredRequests)
  .addFilter(filterSuccessfulSqsDependencies)
  .addModifier(telemetry.processors.enrichSpanNameWithHttpRoute())
  .startRecording()

const shutdown = async () => {
  try {
    await flushTelemetry()
  } finally {
    process.exit(0)
  }
}

process.on('SIGTERM', () => shutdown())
process.on('SIGINT', () => shutdown())
