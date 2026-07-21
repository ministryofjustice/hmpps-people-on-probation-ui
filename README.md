# hmpps-people-on-probation-ui

[![Ministry of Justice Repository Compliance Badge](https://github-community.service.justice.gov.uk/repository-standards/api/hmpps-people-on-probation-ui/badge?style=flat)](https://github-community.service.justice.gov.uk/repository-standards/hmpps-people-on-probation-ui)
[![Docker Repository on ghcr](https://img.shields.io/badge/ghcr.io-repository-2496ED.svg?logo=docker)](https://ghcr.io/ministryofjustice/hmpps-people-on-probation-ui)

A service that allows people on probation to view their probation details, appointments, progress, requirements, and contact information. Built with Node.js, TypeScript, Express, and Nunjucks using the GOV.UK and MoJ Frontend design systems.

## Prerequisites

- [Node.js](https://nodejs.org/) v24 and npm v11 (use [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) to manage versions)
- [Docker](https://www.docker.com/) and Docker Compose (for running dependencies)
- Access to the [People on Probation API](https://github.com/ministryofjustice/hmpps-people-on-probation-api) or a running local instance

## Getting started

### 1. Clone the repository

```bash
git clone https://github.com/ministryofjustice/hmpps-people-on-probation-ui.git
cd hmpps-people-on-probation-ui
```

### 2. Authenticate with GitHub Packages

Some dependencies (e.g. `@justiceaiunit/chatbot-widget`) are private packages hosted on GitHub Packages, not the public npm registry. Install the [GitHub CLI](https://docs.github.com/en/github-cli/github-cli/quickstart), then generate a `NODE_AUTH_TOKEN` from it:

```bash
gh auth login
gh auth refresh -s read:packages
export NODE_AUTH_TOKEN="$(gh auth token)"
```

Add the `export` line to your shell profile (e.g. `~/.zshrc`) so it persists across sessions. `NODE_AUTH_TOKEN` must be set before running `npm install`/`npm run setup` below.

### 3. Install dependencies

```bash
npm run setup
```

This runs `npm ci` and any configured post-install scripts. Use `npm run setup` rather than `npm install` directly.

### 4. Set up environment variables

Copy the example environment file and fill in the required values:

```bash
cp .env.example .env
```

See [Environment variables](#environment-variables) below for details on each variable.

## Running the application

### Option A — Docker Compose (quickest start)

Starts the app and all its dependencies (HMPPS Auth, backing API) in containers:

```bash
docker compose pull
docker compose up
```

The app will be available at [http://localhost:3000](http://localhost:3000).

### Option B — Local development with hot reload

Start only the backing services (not the app itself):

```bash
docker compose up --scale=app=0
```

Then run the app locally with file-watching and automatic rebuilds:

```bash
npm run start:dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

## Environment variables

All variables are configured in `.env` (copy from `.env.example`). The key ones are:

| Variable | Description | Default |
|---|---|---|
| `PORT` | Port the app listens on | `3000` |
| `NODE_ENV` | Node environment | `development` |
| `PEOPLE_ON_PROBATION_API_URL` | Base URL of the People on Probation API | `http://localhost:8080` |
| `HMPPS_AUTH_URL` | HMPPS Auth URL (for system token requests) | `https://sign-in-dev.hmpps.service.justice.gov.uk/auth` |
| `CLIENT_CREDS_CLIENT_ID` | Client ID for system-to-API calls | — |
| `CLIENT_CREDS_CLIENT_SECRET` | Client secret for system-to-API calls | — |
| `ONE_LOGIN_CLIENT_ID` | GOV.UK One Login client ID | — |
| `ONE_LOGIN_PRIVATE_KEY_BASE64` | Base64-encoded private key for One Login | — |
| `ONE_LOGIN_PUBLIC_KEY_BASE64` | Base64-encoded public key for One Login | — |
| `SESSION_SECRET` | Secret used to sign session cookies | — |
| `REDIS_ENABLED` | Enable Redis for session storage | `false` |
| `REDIS_HOST` | Redis host | `localhost` |
| `AUDIT_ENABLED` | Enable sending HMPPS audit events | `false` |
| `FEEDBACK_BANNER_ENABLED` | Show the feedback phase banner and inject the SmartSurvey popup script | `false` |
| `AUDIT_SQS_REGION` | AWS region for the HMPPS audit SQS queue | `eu-west-2` |
| `AUDIT_SQS_QUEUE_URL` | HMPPS audit SQS queue URL | `http://localhost:4566/000000000000/mainQueue` |
| `AUDIT_SERVICE_NAME` | Service name included in HMPPS audit messages | `hmpps-probation-accounts` |
| `FEATURE_ADMIN_PREVIEW` | Master switch for the `/admin` "preview as user" feature | `false` |
| `AUTH_CODE_CLIENT_ID` | HMPPS Auth client ID for the admin sign-in (authorization code grant) | — |
| `AUTH_CODE_CLIENT_SECRET` | HMPPS Auth client secret for the admin sign-in | — |
| `ADMIN_AUTHORISED_ROLES` | HMPPS Auth roles (without `ROLE_`) allowed to use admin preview | — |
| `ADMIN_RESTRICT_BY_USERNAME` | Use the username allowlist gate instead of the role gate (see [Admin preview](#admin-preview-preview-as-user)) | `false` |
| `ADMIN_AUTHORISED_USERNAMES` | HMPPS Auth usernames allowed to use admin preview when `ADMIN_RESTRICT_BY_USERNAME=true` | — |

### Local authentication bypass

To skip GOV.UK One Login during local development, enable the local auth bypass in `.env`:

```bash
LOCAL_AUTH_ENABLED=true
LOCAL_AUTH_ONE_LOGIN_SUBJECT=your-test-subject-id
LOCAL_AUTH_EMAIL=local@example.com
LOCAL_AUTH_DISPLAY_NAME=Local User
```

Then visit [http://localhost:3000/local/sign-in](http://localhost:3000/local/sign-in) to create a session directly, bypassing the One Login flow. The app still calls the People on Probation API using `LOCAL_AUTH_ONE_LOGIN_SUBJECT` to look up the registered user.

### HMPPS audit events

The app uses [`@ministryofjustice/hmpps-audit-client`](https://www.npmjs.com/package/@ministryofjustice/hmpps-audit-client) to send audit messages to the HMPPS audit SQS queue when `AUDIT_ENABLED=true`.

Authentication audit events are emitted once GOV.UK One Login has identified the user, so audit messages always include a meaningful `who` value.

| Action | When it is sent | Subject |
|---|---|---|
| `USER_REGISTRATION_ATTEMPTED` | One Login has identified a user on an invite registration journey | One Login subject |
| `USER_REGISTERED` | Registration completed successfully and an app session was created | CRN |
| `USER_REGISTRATION_FAILED` | One Login identified the user, but completing registration failed | One Login subject |
| `USER_SIGN_IN_ATTEMPTED` | One Login has identified a returning user on a sign-in journey | One Login subject |
| `USER_SIGNED_IN` | Sign-in completed successfully and an app session was created | CRN |
| `USER_SIGN_IN_FAILED` | One Login identified the user, but looking up the registered user failed | One Login subject |
| `ADMIN_PREVIEW_SEARCH_ATTEMPTED` | An admin submitted a CRN on the admin search page | CRN (or absent for an invalid-format search) |
| `ADMIN_PREVIEW_STARTED` | A CRN search succeeded and a preview session was created | CRN |
| `ADMIN_PREVIEW_ENDED` | An admin ended an active preview session | CRN |

Pre-identity failures, such as a missing One Login transaction cookie or state mismatch, are logged by the app but are not sent as audit events because the service cannot reliably identify `who` performed the action.

## Admin preview ("preview as user")

`/admin` lets an HMPPS-Auth-authenticated admin search for a CRN and preview the citizen-facing app as that person, without needing the citizen's own GOV.UK One Login credentials. It is gated behind `FEATURE_ADMIN_PREVIEW` (`false` unless set — `.env.example` ships it `true` for local testing against the docker-compose `hmpps-auth` container below, and `helm_deploy/values-{dev,preprod,prod}.yaml` each set it `true` explicitly, along with `ADMIN_RESTRICT_BY_USERNAME=true`) and uses a second, independent HMPPS Auth identity (`res.locals.adminUser`, set by `server/middleware/setUpAdminAuthentication.ts`) — completely separate from the citizen One Login session (`res.locals.user`). Note that `ADMIN_AUTHORISED_USERNAMES`/`ADMIN_AUTHORISED_ROLES` are still empty in every environment, so turning the feature on alone doesn't let anyone through the gate — one of those must also be populated per environment before the feature is actually usable there.

On a successful CRN search, `/admin/search` mints a normal entry in the same session store every citizen session already uses, marked with `previewedByAdmin` and a dedicated `adminPreviewSubject` (not the citizen `registeredUserDetails` field — see `server/auth/sessionStore.ts`). It's kept on its own cookie though (`adminPreviewSessionCookieName`, separate from the citizen `appSessionCookieName` — see `server/auth/cookies.ts`), so a preview can never collide with or overwrite a real citizen session sharing the same browser; `server/auth/currentUser.ts` still loads it into `res.locals.user` (preferring an active preview over an unrelated citizen session), so every existing citizen-facing route works unchanged. Admin preview sessions are excluded from analytics (`server/routes/analytics.ts`) since they aren't real citizen usage.

Access is controlled by one of two gates, both applied in `server/routes/admin.ts`:

- **Role-based (`requireAdminRole`, the default)** — checks the admin's HMPPS Auth token for any role listed in `ADMIN_AUTHORISED_ROLES`.
- **Username allowlist (`requireAdminUsername`, temporary)** — checks the admin's HMPPS Auth username against `ADMIN_AUTHORISED_USERNAMES`. Enabled by setting `ADMIN_RESTRICT_BY_USERNAME=true`; switch it back to `false` to return to the role-based gate — no code changes needed. Intended for use while the admin cohort's role is still being agreed with the auth team.

### Testing HMPPS Auth locally (admin preview)

`docker-compose.yml` already defines an `hmpps-auth` container (the real HMPPS Auth server, `dev` Spring profile) on port 9090 — `.env.example` points `HMPPS_AUTH_URL`/`HMPPS_AUTH_EXTERNAL_URL` at it and ships `FEATURE_ADMIN_PREVIEW=true` and `ADMIN_RESTRICT_BY_USERNAME=true` by default, so this is the quickest way to exercise the admin sign-in flow end-to-end without needing anything registered against the real dev tenant. Note that pointing `HMPPS_AUTH_URL` at the local container affects *both* `AUTH_CODE_CLIENT_ID`/`SECRET` (admin sign-in) and `CLIENT_CREDS_CLIENT_ID`/`SECRET` (the system client every citizen-facing API call uses) — both clients below need to be registered in the same local container, and `PEOPLE_ON_PROBATION_API_URL` needs to point at an instance that trusts tokens issued by it.

1. Start it:

   ```bash
   docker compose up -d hmpps-auth
   ```

2. Register the admin sign-in client (authorization code grant). Visit [http://localhost:9090/auth/new-ui/clients/add](http://localhost:9090/auth/new-ui/clients/add) and sign in as the HMPPS Auth dev-seed superuser `AUTH_ADM` / `password123456`. Then:
   - Grant type: **Authorization code**
   - Client ID: e.g. `hmpps-people-on-probation-ui-admin`
   - Registered redirect URIs: `http://localhost:3000/admin/sign-in/callback` **only** — see the warning below before adding a second one
   - Approved scopes: `read,write`
   - Access token validity: `3600`
   - Jira number: any non-empty value

   Put the resulting client ID/secret in `AUTH_CODE_CLIENT_ID`/`AUTH_CODE_CLIENT_SECRET`.

   > **Don't register more than one redirect URI on this client.** This container's `/oauth/authorize` endpoint internally proxies to its own newer `/oauth2/authorize` endpoint, and that internal call starts failing with a `401` (surfaced to the browser as HMPPS Auth's generic "Access denied" page) the moment the client has two or more registered redirect URIs — confirmed by editing an unrelated, previously-working pre-seeded client to add a second URI and watching it break too. A single registered URI keeps sign-in working. This is also why the `redirect_uri` on the sign-out request (`authParameters` in `server/middleware/setUpAdminAuthentication.ts`) can't point at a nicer post-logout landing page locally — it would need a second registered URI, so it falls back to HMPPS Auth's own sign-in page instead.

3. Register the system client (client credentials grant), used for every citizen-facing People on Probation API call. Same add-client screen, different settings:
   - Grant type: **Client credentials**
   - Client ID: e.g. `hmpps-people-on-probation-ui-client-1`
   - No redirect URI needed
   - Approved scopes: `read,write`
   - Access token validity: `3600`
   - Jira number: any non-empty value

   Put the resulting client ID/secret in `CLIENT_CREDS_CLIENT_ID`/`CLIENT_CREDS_CLIENT_SECRET`. Verify it works with:

   ```bash
   curl -u '<client_id>:<client_secret>' -X POST 'http://localhost:9090/auth/oauth/token?grant_type=client_credentials'
   ```

   A `200` with an `access_token` in the body confirms the credentials are good.

   In both cases the secret is shown **once** on save — copy it immediately (use the "Duplicate" button on the client's view page to mint a fresh credential pair if you miss it). The container's database is in-memory (H2), so both clients are lost on every `docker compose down`/restart and need re-registering.

4. Set `ADMIN_AUTHORISED_USERNAMES=AUTH_ADM` (already in `.env.example`) and use the username gate (`ADMIN_RESTRICT_BY_USERNAME=true`), not the role gate, for local testing: granting a role to a user requires hitting hmpps-auth's role-management API, which delegates to `manage-users-api` — a service not included in this docker-compose stack, so that call 500s locally.

5. Visit [http://localhost:3000/admin/sign-in](http://localhost:3000/admin/sign-in) and sign in as `AUTH_ADM` / `password123456`. You should land on `/admin/search`.

If you hit HMPPS Auth's own "Access denied" page mid-flow despite following the above, check `docker logs hmpps-auth` for the actual cause rather than assuming your credentials are wrong — the generic page is shown for several unrelated failure types (see the redirect-URI warning in step 2).

## Application pages

| Path | Description |
|---|---|
| `/` | Home — next appointment, missed appointment, and order progress summary |
| `/appointments` | Appointments and activities (future and past) |
| `/progress` | Your probation progress — overall order and requirement progress bars |
| `/requirements` | Order requirements and charge details |
| `/probation-officer` | Probation officer name, phone, and office address |
| `/details` | Personal, contact, and emergency contact details |
| `/admin/search` | Admin "preview as user" — search a CRN and start/end a preview session (see [Admin preview](#admin-preview-preview-as-user)) |

## Running tests

### Unit tests

```bash
npm run test
```

### Type checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

Auto-fix lint issues:

```bash
npm run lint-fix
```

### Integration tests (Playwright)

Start the test dependencies (WireMock stubs):

```bash
docker compose -f docker-compose-test.yml up
```

Start the app in feature-test mode:

```bash
npm run start-feature
```

On first run, install Playwright browsers:

```bash
npm run int-test-init:ci
```

Run integration tests headlessly:

```bash
npm run int-test
```

Run with the Playwright UI:

```bash
npm run int-test-ui
```

## Security

Our security policy is available [here](https://github.com/ministryofjustice/hmpps-people-on-probation-ui/security/policy).

Pre-commit hooks (via [prek](https://prek.j178.dev/cli/)) scan staged files for secrets before every commit. These are set up automatically as part of `npm run setup`. See the [precommit hooks docs](https://github.com/ministryofjustice/hmpps-typescript-lib/tree/main/packages/precommit-hooks) for guidance on handling false positives.

## Change log

A changelog for the service is available [here](./CHANGELOG.md).
