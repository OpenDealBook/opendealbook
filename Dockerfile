# syntax=docker/dockerfile:1

# The Next.js web app (port 3000). The Temporal worker has its own dedicated
# image; see Dockerfile.worker.

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# Toolchain for native addons: @datadog/pprof, sharp, @swc/core,
# @tailwindcss/oxide, @sentry/cli.
FROM base AS toolchain
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

# pnpm-workspace.yaml leaves three build scripts undecided (the "set this to
# true or false" placeholders for @swc/core, @sentry/cli, @parcel/watcher).
# pnpm v11 defaults strictDepBuilds on and aborts on undecided build scripts, so
# resolve the placeholders to an explicit skip for the image build only (these
# are dev-only tools, not needed to build or run the web app); the repo file
# on disk is untouched. @datadog/pprof stays approved and still builds its addon.
FROM toolchain AS source
COPY . .
RUN sed -i 's/set this to true or false/false/g' pnpm-workspace.yaml

# Full workspace install and web build, then assemble the standalone bundle
# (standalone omits public/ and .next/static by default).
FROM source AS builder
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=web
RUN mkdir -p apps/web/public \
  && cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static \
  && cp -r apps/web/public apps/web/.next/standalone/apps/web/public

# Slim runtime: the web standalone output only.
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Web: self-contained Next standalone output. Entry: /app/web/apps/web/server.js
COPY --from=builder /app/apps/web/.next/standalone /app/web

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
