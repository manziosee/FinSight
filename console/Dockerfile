# syntax=docker/dockerfile:1.7
# Build from the console/ directory:  docker build -t finsight/console console/
# Base image pinned by digest (tag kept for readability); Dependabot/Renovate bump both.
ARG NODE_IMAGE=node:22-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM ${NODE_IMAGE} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Baked in at build time — this is a static SPA-ish client, not server-rendered data.
ARG NEXT_PUBLIC_FINSIGHT_API_URL=http://localhost:8088
ENV NEXT_PUBLIC_FINSIGHT_API_URL=${NEXT_PUBLIC_FINSIGHT_API_URL}
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
# Docker sets $HOSTNAME to the container id by default; Next's standalone server.js
# binds to $HOSTNAME if set, so without this override it tries (and fails) to resolve
# the container id as an address instead of listening on all interfaces.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN groupadd --system app && useradd --system --gid app --uid 10001 app
WORKDIR /app
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
USER app
EXPOSE 3000
# Node's built-in fetch: no curl (and its CVE surface) in the runtime image.
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=4 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "server.js"]
