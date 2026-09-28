# syntax=docker/dockerfile:1

# One image, two runtime targets: the Next.js web app (port 3000) and the
# Temporal worker. APP_TARGET at runtime selects which process starts.

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# Toolchain for native addons: @datadog/pprof, @temporalio/core-bridge, sharp,
# @swc/core, @tailwindcss/oxide, @sentry/cli.
FROM base AS toolchain
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

# pnpm-workspace.yaml leaves three build scripts undecided (the "set this to
# true or false" placeholders for @swc/core, @sentry/cli, @parcel/watcher).
# pnpm v11 defaults strictDepBuilds on and aborts on undecided build scripts, so
# resolve the placeholders to an explicit skip for the image build only (these
# are dev-only tools, not needed to build or run either target); the repo file
# on disk is untouched. @datadog/pprof stays approved and still builds its addon.
FROM toolchain AS source
COPY . .
RUN sed -i 's/set this to true or false/false/g' pnpm-workspace.yaml

# Prune to the worker's transitive workspace closure. This is a source-only
# operation, kept independent of the web build so the worker payload builds on
# its own. --docker splits the result into json/ (manifests + lockfile) and
# full/ (sources).
FROM source AS pruner
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm dlx turbo@2.10.4 prune workers --docker --out-dir /prune

# Production-only worker install. Installing from json/ first, then overlaying
# full/, preserves the pnpm packages/* symlink layout so Node type-stripping
# resolves @odb/* sources by a real path outside node_modules (node refuses to
# strip types under a node_modules path). @temporalio/core-bridge ships a
# prebuilt linux .node, so no native build runs here.
FROM toolchain AS worker-deps
COPY --from=pruner /prune/json/ ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile --prod
COPY --from=pruner /prune/full/ ./

# Full workspace install and web build, then assemble the standalone bundle
# (standalone omits public/ and .next/static by default).
FROM source AS builder
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=web
RUN mkdir -p apps/web/public \
  && cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static \
  && cp -r apps/web/public apps/web/.next/standalone/apps/web/public

# Slim runtime carrying both payloads under separate roots so the web
# standalone node_modules never collides with the worker's.
FROM base AS runtime
ENV NODE_ENV=production
ENV APP_TARGET=web
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Web: self-contained Next standalone output. Entry: /app/web/apps/web/server.js
COPY --from=builder /app/apps/web/.next/standalone /app/web

# Worker: pruned workspace source plus production node_modules.
COPY --from=worker-deps /app /app/worker

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
