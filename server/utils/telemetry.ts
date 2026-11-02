// Must be imported before any other module so OpenTelemetry can instrument http, express and bunyan.
// serviceName is hard-coded rather than read via applicationInfo, which would load config and its
// dependencies before instrumentation is registered.
import { initialiseTelemetry, flushTelemetry, telemetry } from '@ministryofjustice/hmpps-azure-telemetry'
import { filterSuccessfulIgnoredRequests, filterSuccessfulSqsDependencies } from './telemetryFilters'

const FLUSH_TIMEOUT_MS = 5000

initialiseTelemetry({
  serviceName: 'hmpps-people-on-probation-ui',
  serviceVersion: process.env.BUILD_NUMBER || '1_0_0',
  connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
  debug: process.env.DEBUG_TELEMETRY === 'true',
})
  .addFilter(filterSuccessfulIgnoredRequests)
  .addFilter(filterSuccessfulSqsDependencies)
  .addModifier(telemetry.processors.enrichSpanNameWithHttpRoute())
  .startRecording()

const shutdown = async () => {
  try {
    await Promise.race([
      flushTelemetry(),
      new Promise(resolve => {
        setTimeout(resolve, FLUSH_TIMEOUT_MS).unref()
      }),
    ])
  } finally {
    process.exit(0)
  }
}

process.once('SIGTERM', () => shutdown())
process.once('SIGINT', () => shutdown())
