import { AgentConfig } from '@ministryofjustice/hmpps-rest-client'

function get(name: string, fallback: string): string {
  return process.env[name] || fallback
}

export const nextServerConfig = {
  redis: {
    enabled: get('REDIS_ENABLED', 'false') === 'true',
    host: get('REDIS_HOST', 'localhost'),
    port: Number(get('REDIS_PORT', '6379')),
    password: process.env.REDIS_AUTH_TOKEN,
    tlsEnabled: get('REDIS_TLS_ENABLED', 'false') === 'true',
  },
  apis: {
    hmppsAuth: {
      url: get('HMPPS_AUTH_URL', 'http://localhost:9090/auth'),
      externalUrl: get('HMPPS_AUTH_EXTERNAL_URL', get('HMPPS_AUTH_URL', 'http://localhost:9090/auth')),
      timeout: {
        response: Number(get('HMPPS_AUTH_TIMEOUT_RESPONSE', '10000')),
        deadline: Number(get('HMPPS_AUTH_TIMEOUT_DEADLINE', '10000')),
      },
      agent: new AgentConfig(Number(get('HMPPS_AUTH_TIMEOUT_RESPONSE', '10000'))),
      authClientId: get('AUTH_CODE_CLIENT_ID', 'clientid'),
      authClientSecret: get('AUTH_CODE_CLIENT_SECRET', 'clientsecret'),
      systemClientId: get('CLIENT_CREDS_CLIENT_ID', 'clientid'),
      systemClientSecret: get('CLIENT_CREDS_CLIENT_SECRET', 'clientsecret'),
    },
    peopleOnProbationApi: {
      url: get('PEOPLE_ON_PROBATION_API_URL', 'http://localhost:8080'),
      timeout: {
        response: Number(get('PEOPLE_ON_PROBATION_API_TIMEOUT_RESPONSE', '5000')),
        deadline: Number(get('PEOPLE_ON_PROBATION_API_TIMEOUT_DEADLINE', '5000')),
      },
      agent: new AgentConfig(Number(get('PEOPLE_ON_PROBATION_API_TIMEOUT_RESPONSE', '5000'))),
    },
  },
}
