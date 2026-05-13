import { AgentConfig } from '@ministryofjustice/hmpps-rest-client'

function get(name: string, fallback: string): string {
  return process.env[name] || fallback
}

export const nextServerConfig = {
  ingressUrl: get('INGRESS_URL', 'http://localhost:3000'),
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
  session: {
    secret: get('SESSION_SECRET', 'app-insecure-default-session'),
    expiryMinutes: Number(get('WEB_SESSION_TIMEOUT_IN_MINUTES', '120')),
  },
  oneLogin: {
    issuerUrl: get('ONE_LOGIN_ISSUER_URL', ''),
    clientId: get('ONE_LOGIN_CLIENT_ID', ''),
    redirectUri: get('ONE_LOGIN_REDIRECT_URI', `${get('INGRESS_URL', 'http://localhost:3000')}/sign-in/callback`),
    postLogoutRedirectUri: get('ONE_LOGIN_POST_LOGOUT_REDIRECT_URI', get('INGRESS_URL', 'http://localhost:3000')),
    scopes: get('ONE_LOGIN_SCOPES', 'email,phone,openid'),
    vtr: get('ONE_LOGIN_VTR', 'Cl.Cm'),
    keyId: get('ONE_LOGIN_KEY_ID', ''),
    privateKeyBase64: process.env.ONE_LOGIN_PRIVATE_KEY_BASE64,
    publicKeyBase64: process.env.ONE_LOGIN_PUBLIC_KEY_BASE64,
  },
}
