FROM oven/bun:1.3.13 AS bun-runtime
FROM node:24-slim AS builder
COPY --from=bun-runtime /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
RUN corepack enable

COPY . .
RUN --mount=type=secret,id=web_env,target=/app/apps/web/.env.local --mount=type=secret,id=server_env,target=/app/apps/server/.env.local --mount=type=cache,id=resora-pnpm,target=/pnpm/store pnpm install --frozen-lockfile --store-dir /pnpm/store

ENV NODE_ENV=production
RUN --mount=type=secret,id=web_env,target=/app/apps/web/.env.local --mount=type=secret,id=server_env,target=/app/apps/server/.env.local pnpm --filter server run build

FROM node:24-trixie-slim AS runner
# Native PostgreSQL utilities are required for verified custom-format downloads.
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client-17 && rm -rf /var/lib/apt/lists/*
COPY --from=bun-runtime /usr/local/bin/bun /usr/local/bin/bun
# Node is needed by pnpm-generated Varlock CLI shims; Express still runs on Bun.
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app /app

USER node

EXPOSE 3000

WORKDIR /app/apps/server
CMD ["bun", "dist/index.mjs"]
