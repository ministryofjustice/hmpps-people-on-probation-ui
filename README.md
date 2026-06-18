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

### 2. Install dependencies

```bash
npm run setup
```

This runs `npm ci` and any configured post-install scripts. Use `npm run setup` rather than `npm install` directly.

### 3. Set up environment variables

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
| `FEEDBACK_BANNER_ENABLED` | Show the feedback phase banner | `false` |
| `AUDIT_SQS_REGION` | AWS region for the HMPPS audit SQS queue | `eu-west-2` |
| `AUDIT_SQS_QUEUE_URL` | HMPPS audit SQS queue URL | `http://localhost:4566/000000000000/mainQueue` |
| `AUDIT_SERVICE_NAME` | Service name included in HMPPS audit messages | `hmpps-probation-accounts` |

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

Pre-identity failures, such as a missing One Login transaction cookie or state mismatch, are logged by the app but are not sent as audit events because the service cannot reliably identify `who` performed the action.

## Application pages

| Path | Description |
|---|---|
| `/` | Home — next appointment, missed appointment, and order progress summary |
| `/appointments` | Appointments and activities (future and past) |
| `/progress` | Your probation progress — overall order and requirement progress bars |
| `/requirements` | Order requirements and charge details |
| `/probation-officer` | Probation officer name, phone, and office address |
| `/details` | Personal, contact, and emergency contact details |

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
