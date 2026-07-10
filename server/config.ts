import { AgentConfig } from '@ministryofjustice/hmpps-rest-client'

const production = process.env.NODE_ENV === 'production'

function get<T>(name: string, fallback: T, options = { requireInProduction: false }): T | string {
  if (process.env[name]) {
    return process.env[name]
  }
  if (fallback !== undefined && (!production || !options.requireInProduction)) {
    return fallback
  }
  throw new Error(`Missing env var ${name}`)
}

const requiredInProduction = { requireInProduction: true }

const localAuth = {
  enabled: get('LOCAL_AUTH_ENABLED', 'false') === 'true',
  oneLoginSubject: get('LOCAL_AUTH_ONE_LOGIN_SUBJECT', '') as string,
  email: get('LOCAL_AUTH_EMAIL', 'local@example.com') as string,
  displayName: get('LOCAL_AUTH_DISPLAY_NAME', 'Local User') as string,
}

if (production && localAuth.enabled) {
  throw new Error('LOCAL_AUTH_ENABLED must not be true in production')
}

if (localAuth.enabled && !localAuth.oneLoginSubject) {
  throw new Error('LOCAL_AUTH_ONE_LOGIN_SUBJECT must be set when LOCAL_AUTH_ENABLED is true')
}

const auditConfig = () => {
  const auditEnabled = get('AUDIT_ENABLED', 'false') === 'true'
  return {
    enabled: auditEnabled,
    queueUrl: get(
      'AUDIT_SQS_QUEUE_URL',
      'http://localhost:4566/000000000000/mainQueue',
      auditEnabled && requiredInProduction,
    ),
    serviceName: get('AUDIT_SERVICE_NAME', 'hmpps-probation-accounts', auditEnabled && requiredInProduction),
    region: get('AUDIT_SQS_REGION', 'eu-west-2'),
  }
}

export default {
  buildNumber: get('BUILD_NUMBER', '1_0_0', requiredInProduction),
  productId: get('PRODUCT_ID', 'UNASSIGNED', requiredInProduction),
  gitRef: get('GIT_REF', 'xxxxxxxxxxxxxxxxxxx', requiredInProduction),
  branchName: get('GIT_BRANCH', 'xxxxxxxxxxxxxxxxxxx', requiredInProduction),
  production,
  https: process.env.NO_HTTPS === 'true' ? false : production,
  staticResourceCacheDuration: '1h',
  redis: {
    enabled: get('REDIS_ENABLED', 'false', requiredInProduction) === 'true',
    host: get('REDIS_HOST', 'localhost', requiredInProduction),
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_AUTH_TOKEN,
    tls_enabled: get('REDIS_TLS_ENABLED', 'false'),
  },
  session: {
    secret: get('SESSION_SECRET', 'app-insecure-default-session', requiredInProduction),
    expiryMinutes: Number(get('WEB_SESSION_TIMEOUT_IN_MINUTES', 30)),
  },
  apis: {
    hmppsAuth: {
      url: get('HMPPS_AUTH_URL', 'http://localhost:9090/auth', requiredInProduction),
      healthPath: '/health/ping',
      timeout: {
        response: Number(get('HMPPS_AUTH_TIMEOUT_RESPONSE', 10000)),
        deadline: Number(get('HMPPS_AUTH_TIMEOUT_DEADLINE', 10000)),
      },
      agent: new AgentConfig(Number(get('HMPPS_AUTH_TIMEOUT_RESPONSE', 10000))),
      systemClientId: get('CLIENT_CREDS_CLIENT_ID', 'clientid', requiredInProduction),
      systemClientSecret: get('CLIENT_CREDS_CLIENT_SECRET', 'clientsecret', requiredInProduction),
    },
    peopleOnProbationApi: {
      url: get('PEOPLE_ON_PROBATION_API_URL', 'http://localhost:8080', requiredInProduction),
      healthPath: '/health/ping',
      timeout: {
        response: Number(get('PEOPLE_ON_PROBATION_API_TIMEOUT_RESPONSE', 5000)),
        deadline: Number(get('PEOPLE_ON_PROBATION_API_TIMEOUT_DEADLINE', 5000)),
      },
      agent: new AgentConfig(Number(get('PEOPLE_ON_PROBATION_API_TIMEOUT_RESPONSE', 5000))),
    },
  },
  sqs: {
    audit: auditConfig(),
  },
  oneLogin: {
    issuerUrl: get('ONE_LOGIN_ISSUER_URL', '', requiredInProduction) as string,
    clientId: get('ONE_LOGIN_CLIENT_ID', '', requiredInProduction) as string,
    redirectUri: get(
      'ONE_LOGIN_REDIRECT_URI',
      'http://localhost:3000/sign-in/callback',
      requiredInProduction,
    ) as string,
    postLogoutRedirectUri: get(
      'ONE_LOGIN_POST_LOGOUT_REDIRECT_URI',
      'http://localhost:3000',
      requiredInProduction,
    ) as string,
    scopes: get('ONE_LOGIN_SCOPES', 'openid email phone') as string,
    vtr: get('ONE_LOGIN_VTR', 'Cl.Cm') as string,
    keyId: get('ONE_LOGIN_KEY_ID', '', requiredInProduction) as string,
    privateKeyBase64: process.env.ONE_LOGIN_PRIVATE_KEY_BASE64,
    publicKeyBase64: process.env.ONE_LOGIN_PUBLIC_KEY_BASE64,
  },
  localAuth,
  popChatbot: {
    // Both vars are optional so the chatbot can be switched off in any env
    // (including production) without a redeploy — leave POP_CHATBOT_API_URL
    // or POP_CHATBOT_API_KEY unset and `chatbotEnabled` becomes false.
    apiUrl: get('POP_CHATBOT_API_URL', '') as string,
    apiKey: process.env.POP_CHATBOT_API_KEY,
    // Optional explicit URL for the embed feedback endpoint. When unset,
    // the /chat/feedback proxy derives it from POP_CHATBOT_API_URL by
    // swapping /chat-embed-stream → /feedback-embed. Set this explicitly
    // if the chat and feedback endpoints ever diverge in path structure —
    // otherwise feedback would silently 503 while chat kept working, and
    // the chat smoke test wouldn't catch it.
    feedbackUrl: get('POP_CHATBOT_FEEDBACK_URL', '') as string,
    // Optional HS256-signing secret shared with the chatbot backend. When set,
    // this route mints a short-lived JWT carrying the flattened user context
    // and passes it via the X-POP-User-Token header. The chatbot then
    // requires and verifies that JWT, so a leaked API key alone can't be
    // used to fabricate a user identity. Leave unset in envs where the
    // chatbot backend hasn't got the corresponding POP_USER_TOKEN_SECRET set
    // yet — the proxy will fall back to sending user_context in the body.
    userTokenSecret: process.env.POP_CHATBOT_USER_TOKEN_SECRET,
  },
  ingressUrl: get('INGRESS_URL', 'http://localhost:3000', requiredInProduction),
  environmentName: get('ENVIRONMENT_NAME', ''),
  feedbackBanner: {
    enabled: get('FEEDBACK_BANNER_ENABLED', 'false') === 'true',
  },
  features: {
    missedAppointmentAlert: get('FEATURE_MISSED_APPOINTMENT_ALERT', 'false') === 'true',
    // Master switch for the chatbot widget and its /api/chatbot routes.
    // On by default so existing envs where the chatbot is live keep it
    // live without an extra helm values entry — set FEATURE_CHATBOT=false
    // to switch it off. Independent of POP_CHATBOT_API_URL/API_KEY so the
    // widget can be dark-launched (creds present, flag off) or emergency-
    // killed (flag off, creds untouched) without a redeploy.
    chatbot: get('FEATURE_CHATBOT', 'true') === 'true',
  },
}
