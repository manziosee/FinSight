# syntax=docker/dockerfile:1.7
# FinSight frontend (TanStack Start). Build from the frontend/ directory:
#   docker build -t finsight/frontend frontend/
# Base images pinned by digest (tag kept for readability); Dependabot bumps both.
ARG BUN_IMAGE=oven/bun:1.3.11@sha256:0733e50325078969732ebe3b15ce4c4be5082f18c4ac1a0f0ca4839c2e4e42a7
ARG NODE_IMAGE=node:22-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee

FROM ${BUN_IMAGE} AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    # Gateway address as seen from this container, and the public URL used for doc links.
    FINSIGHT_API_URL=http://api-gateway:8000 \
    FINSIGHT_PUBLIC_API_URL=http://localhost:8088
RUN groupadd --system app && useradd --system --gid app --uid 10001 app
WORKDIR /app
# Nitro's node-server output is self-contained (traced node_modules included).
COPY --from=build --chown=app:app /app/.output ./.output
USER app
EXPOSE 3000
# Liveness of this server only — not of the API behind it.
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=4 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", ".output/server/index.mjs"]
