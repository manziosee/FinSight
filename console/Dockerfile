# syntax=docker/dockerfile:1.7
# Build from the console/ directory:  docker build -t finsight/console console/
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Baked in at build time — this is a static SPA-ish client, not server-rendered data.
ARG NEXT_PUBLIC_FINSIGHT_API_URL=http://localhost:8088
ENV NEXT_PUBLIC_FINSIGHT_API_URL=${NEXT_PUBLIC_FINSIGHT_API_URL}
RUN npm run build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
# Docker sets $HOSTNAME to the container id by default; Next's standalone server.js
# binds to $HOSTNAME if set, so without this override it tries (and fails) to resolve
# the container id as an address instead of listening on all interfaces.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN groupadd --system app && useradd --system --gid app --uid 10001 app \
    && apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=4 \
    CMD curl -fsS http://localhost:3000/ || exit 1
CMD ["node", "server.js"]
