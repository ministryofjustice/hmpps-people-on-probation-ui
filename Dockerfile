# Stage: base image
FROM ghcr.io/ministryofjustice/hmpps-node:24-alpine AS base

# Patch OS packages ahead of base image refreshes, so container scans don't flag
# already-fixed CVEs.
RUN apk upgrade --no-cache

ARG BUILD_NUMBER
ARG GIT_REF
ARG GIT_BRANCH

# Cache breaking and ensure required build / git args defined
RUN test -n "$BUILD_NUMBER" || (echo "BUILD_NUMBER not set" && false)
RUN test -n "$GIT_REF" || (echo "GIT_REF not set" && false)
RUN test -n "$GIT_BRANCH" || (echo "GIT_BRANCH not set" && false)

# Define env variables for runtime health / info
ENV BUILD_NUMBER=${BUILD_NUMBER}
ENV GIT_REF=${GIT_REF}
ENV GIT_BRANCH=${GIT_BRANCH}

# Stage: build assets
FROM base AS build

ARG BUILD_NUMBER
ARG GIT_REF
ARG GIT_BRANCH

# Upgrade npm for the build only; the runtime stage removes npm entirely.
RUN npm install -g --no-audit --no-fund npm@11.21.1 && \
    npm cache clean --force

COPY package*.json .allowed-scripts.mjs .npmrc ./
# TEMP: NODE_AUTH_TOKEN is mounted as a BuildKit secret because the private
# @justiceaiunit/chatbot-widget package lives in JAIU's GitHub Packages and
# needs auth during `npm ci`. When the widget moves to a public / MoJ-scoped
# registry, revert this to a plain `RUN npm run setup`, drop the .npmrc COPY,
# drop the .dockerignore exception, and revert the inlined docker build in
# .github/workflows/pipeline.yml back to the shared docker_build.yml@v2.
RUN --mount=type=secret,id=NODE_AUTH_TOKEN,env=NODE_AUTH_TOKEN \
    NPM_CONFIG_AUDIT=false NPM_CONFIG_FUND=false npm run setup
ENV NODE_ENV='production'

COPY . .
RUN npm run build

RUN npm prune --no-audit --no-fund --omit=dev

# Stage: copy production assets and dependencies
FROM base

# npm, corepack and yarn are only needed to build. Removing them from the runtime
# image drops their bundled dependencies (undici, picomatch, http-cache-semantics),
# which container scans flag and which often have no patched npm release.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/yarn /usr/local/bin/yarnpkg

COPY --from=build --chown=appuser:appgroup \
        /app/package.json \
        /app/package-lock.json \
        ./

COPY --from=build --chown=appuser:appgroup \
        /app/dist ./dist

COPY --from=build --chown=appuser:appgroup \
        /app/node_modules ./node_modules

EXPOSE 3000
ENV NODE_ENV='production'
USER 2000

CMD [ "node", "dist/server.js" ]
