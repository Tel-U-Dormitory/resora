FROM node:24-slim AS builder
WORKDIR /app
RUN corepack enable

COPY . .
RUN --mount=type=secret,id=web_env,target=/app/apps/web/.env.local --mount=type=secret,id=server_env,target=/app/apps/server/.env.local --mount=type=cache,id=resora-pnpm,target=/pnpm/store pnpm install --frozen-lockfile --store-dir /pnpm/store

ARG NEXT_PUBLIC_SERVER_URL
ARG API_UPSTREAM_URL
ARG SERVER_URL
ENV NEXT_PUBLIC_SERVER_URL=${NEXT_PUBLIC_SERVER_URL}
ENV API_UPSTREAM_URL=${API_UPSTREAM_URL}
ENV SERVER_URL=${SERVER_URL}
ENV NODE_ENV=production
RUN --mount=type=secret,id=web_env,target=/app/apps/web/.env.local --mount=type=secret,id=server_env,target=/app/apps/server/.env.local cd apps/web && pnpm run build && find .next/standalone -type f -name '.env*' ! -name '.env.schema' ! -name '.env.example' -delete
# standalone output excludes public/; ensure it exists so the runner copy never fails
RUN mkdir -p apps/web/public

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
# auto-load needs the Varlock CLI and its installed dependencies.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/.env.schema ./apps/web/.env.schema

ENV HOSTNAME=0.0.0.0
ENV PORT=3001
EXPOSE 3001

USER node
WORKDIR /app/apps/web
CMD ["node", "--import", "varlock/auto-load", "server.js"]
