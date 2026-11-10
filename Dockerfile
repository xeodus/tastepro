# syntax=docker/dockerfile:1.7
#
# Multi-stage build:
#   deps      -> full dependency tree for compiling TypeScript
#   build     -> dist/
#   prod-deps -> production-only node_modules
#   runtime   -> non-root Node image with dist/, content/, and licenses
#
# Bun installs and builds; the runtime stays Node 22 until the Bun runtime
# parity gate passes. The content directory is committed, so the image does not
# need network access at runtime and does not run ingest during the build.

ARG BUN_VERSION=1.4.4
ARG NODE_VERSION=22

FROM oven/bun:${BUN_VERSION} AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun ci

FROM oven/bun:${BUN_VERSION} AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN bun run build

FROM oven/bun:${BUN_VERSION} AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    TASTEPRO_HOST=0.0.0.0 \
    TASTEPRO_PORT=3000 \
    TASTEPRO_LOG_LEVEL=info

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY content ./content
COPY LICENSE NOTICE ATTRIBUTION.md README.md ./

# The official Node image ships an unprivileged `node` user. The server only
# needs read access to the content and write access to /tmp (tmpfs in Compose).
USER node

EXPOSE 3000
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.TASTEPRO_PORT||3000)+'/healthz').then((r)=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/cli.js", "--http"]
