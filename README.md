# hmpps-people-on-probation-ui

[![Ministry of Justice Repository Compliance Badge](https://github-community.service.justice.gov.uk/repository-standards/api/hmpps-people-on-probation-ui/badge?style=flat)](https://github-community.service.justice.gov.uk/repository-standards/hmpps-people-on-probation-ui)
[![Docker Repository on ghcr](https://img.shields.io/badge/ghcr.io-repository-2496ED.svg?logo=docker)](https://ghcr.io/ministryofjustice/hmpps-people-on-probation-ui)

Next.js application for HMPPS People on Probation UI.

# Instructions

If this is a HMPPS project then the creation of new services is automated and cloning/forking this repository is not required.

Documentation to create new services is located [here](https://tech-docs.hmpps.service.justice.gov.uk/creating-new-services/).

This project is community managed by the mojdt `#typescript` slack channel.
Please raise any questions or queries there. Contributions welcome!

Our security policy is located [here](https://github.com/ministryofjustice/hmpps-people-on-probation-ui/security/policy).

## Creating a Cloud Platform namespace

When deploying to a new namespace, you may wish to use the
[templates project namespace](https://github.com/ministryofjustice/cloud-platform-environments/tree/main/namespaces/live.cloud-platform.service.justice.gov.uk/hmpps-templates-dev)
as the basis for your new namespace. This namespace includes an AWS elasticache setup, which is required if you enable
distributed sessions in this service.

Copy this folder and update all the existing namespace references. If you only need the typescript configuration then
remove all kotlin references. Submit a PR to the Cloud Platform team in #ask-cloud-platform. Further instructions from
the Cloud Platform team can be found in
the [Cloud Platform User Guide](https://user-guide.cloud-platform.service.justice.gov.uk/#cloud-platform-user-guide)

## Oauth2 Credentials

The template project is set up to run with two sets of credentials, each one support a different oauth2 flows.
These need to be requested from the auth team by filling in
this [template](https://dsdmoj.atlassian.net/browse/HAAR-140) and raising on their slack channel.

### Auth Code flow

These are used to allow authenticated users to access the application. After the user is redirected from auth back to
the application, the typescript app will use the returned auth code to request a JWT token for that user containing the
user's roles. The JWT token will be verified and then stored in the user's session.

These credentials are configured using the following env variables:

- AUTH_CODE_CLIENT_ID
- AUTH_CODE_CLIENT_SECRET

### Client Credentials flow

These are used by the application to request tokens to make calls to APIs. These are system accounts that will have
their own sets of roles.

Most API calls that occur as part of the request/response cycle will be on behalf of a user.
To make a call on behalf of a user, a username should be passed when requesting a system token. The username will then
become part of the JWT and can be used downstream for auditing purposes.

These tokens are cached until expiration.

These credentials are configured using the following env variables:

- CLIENT_CREDS_CLIENT_ID
- CLIENT_CREDS_CLIENT_SECRET

### Dependencies

### HMPPS Auth

To allow authenticated users to access your application you need to point it to a running instance of `hmpps-auth`.
By default the application is configured to run against an instance running in docker that can be started
via `docker-compose`.

**NB:** It's common for developers to run against the instance of auth running in the development/T3 environment for
local development.
Most APIs don't have images with cached data that you can run with docker: setting up realistic stubbed data in sync
across a variety of services is very difficult.

### REDIS

When deployed to an environment with multiple pods we run applications with an instance of REDIS/Elasticache to provide
a distributed cache of sessions.
The template app is, by default, configured not to use REDIS when running locally.

## Developing locally

Create an environment file by copying `.env.example` to `.env.local`.
Environment variables in `.env.local` are loaded by Next.js during local development and builds.

Install dependencies using `npm run setup`, ensuring you are using `node v24`.

Note: Using `nvm` (or [fnm](https://github.com/Schniz/fnm)), run `nvm install --latest-npm` within the repository folder
to use the correct version of node, and the latest version of npm. This matches the `engines` config in `package.json`
and the github pipeline build config.

To start the app locally:

`npm run dev`

This runs the Next.js dev server on `http://localhost:3000`.

To use the Playwright port:

`npm run start-feature`

This runs the same app on `http://localhost:3007`.

### Runtime assets

Static runtime assets under `public/` are split by ownership.

- Source styles live under `assets/scss`
- Source images live under `assets/images`
- `public/app` is for committed app-owned static files
- `npm run sync:assets` regenerates `public/generated` and `public/assets`

The sync step runs automatically before `dev` and `build`.

### Installing dependencies

By default no pre or post install scripts will be run during `npm install`.
Instead a list of configured install scripts will be run via the [npm script allowlist](https://github.com/ministryofjustice/hmpps-typescript-lib/tree/main/packages/npm-script-allowlist) tool.

Instead of running `npm install`, run `npm run setup` - this runs `npm ci` and then the configured allowlisted install scripts.

### Making changes

The [hmpps precommit hooks library](https://github.com/ministryofjustice/hmpps-typescript-lib/tree/main/packages/precommit-hooks) will ensure that [prek](https://prek.j178.dev/cli/) is installed and initialised against the repo as part of `npm run setup`.

This will run a set of precommit hooks before every commit as configured in `.pre-commit-config.yaml`.
This will scan for potential secrets in the staged files and fail the commit if any are detected.

There's some guidance for dealing with false positives in the [precommit hooks docs](https://github.com/ministryofjustice/hmpps-typescript-lib/tree/main/packages/precommit-hooks#dealing-with-false-positives).

The secret scanner hook can also be configured as described [here](https://github.com/ministryofjustice/devsecops-hooks?tab=readme-ov-file#-configuration).

### Run linter

- `npm run lint` runs `eslint`.
- `npm run typecheck` runs the TypeScript compiler `tsc`.

### Run unit tests

`npm run test`

### Running integration tests

For local running, start a wiremock instance by:

`docker compose -f docker-compose-test.yml up`

Then run the Next app in test mode by:

`npm run start-feature` (or `npm run start-feature:dev` to run with auto-restart on changes)

After first install ensure playwright is initialised:

`npm run int-test-init:ci`

And then either, run tests in headless mode with:

`npm run int-test`

Or run tests with the UI:

`npm run int-test-ui`

## Change log

A changelog for the service is available [here](./CHANGELOG.md)
