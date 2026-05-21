import bunyan from 'bunyan'
import bunyanFormat from 'bunyan-format'

const production = process.env.NODE_ENV === 'production'
const formatOut = bunyanFormat({ outputMode: 'short', color: !production })
const logLevels: bunyan.LogLevel[] = ['fatal', 'error', 'warn', 'info', 'debug', 'trace']
const logLevel = logLevels.find(level => level === process.env.LOG_LEVEL) || 'debug'

const logger = bunyan.createLogger({
  name: 'HMPPS People On Probation Ui',
  stream: formatOut,
  level: logLevel,
})

export default logger
