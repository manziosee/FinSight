# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Shared multi-stage image for every FinSight Python service.
# Build with:  docker build --build-arg SERVICE=identity-service -t finsight/identity .
# ---------------------------------------------------------------------------
# Base images are pinned by digest (tag kept for readability); Dependabot/Renovate bump both.
ARG PYTHON_IMAGE=python:3.12-slim@sha256:a0f57064cbdcd6285fa45f51237ab0b35ea8ebaed06a1f5973e89e19dfb86704

FROM ${PYTHON_IMAGE} AS base
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy
COPY --from=ghcr.io/astral-sh/uv:0.9.30@sha256:538e0b39736e7feae937a65983e49d2ab75e1559d35041f9878b7b7e51de91e4 /uv /uvx /bin/

FROM base AS builder
ARG SERVICE
WORKDIR /app
# Copy only manifests first for layer caching.
COPY pyproject.toml uv.lock ./
COPY libs/finsight-common/pyproject.toml libs/finsight-common/pyproject.toml
COPY services/${SERVICE}/pyproject.toml services/${SERVICE}/pyproject.toml
# Now the source.
COPY libs/finsight-common libs/finsight-common
COPY services/${SERVICE} services/${SERVICE}
# --frozen: build exactly what uv.lock pins. A stale lockfile must fail the build, not
# silently re-resolve to different versions than CI tested.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --package "${SERVICE}" --no-dev --frozen

FROM ${PYTHON_IMAGE} AS runtime
ARG SERVICE
# FORWARDED_ALLOW_IPS: proxies whose X-Forwarded-* headers uvicorn trusts (--proxy-headers).
#   Default trusts only loopback; set it to the edge proxy's address/CIDR where one fronts
#   the service. Never "*" on an internet-facing listener (clients could spoof their IP).
# WEB_CONCURRENCY: uvicorn worker processes. Keep 1 and scale with replicas — every worker
#   would start its own Kafka consumers and outbox relay.
ENV PATH="/app/.venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1 \
    FINSIGHT_SERVICE=${SERVICE} \
    FORWARDED_ALLOW_IPS=127.0.0.1 \
    WEB_CONCURRENCY=1
RUN groupadd --system app && useradd --system --gid app --uid 10001 app
WORKDIR /app
COPY --from=builder --chown=app:app /app /app
USER app
EXPOSE 8000
# stdlib-only probe: no curl (and its CVE surface) in the runtime image.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=4 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)"]
# SERVICE dir name -> python module (identity-service -> identity_service)
CMD ["sh", "-c", "exec uvicorn \"$(echo \"$FINSIGHT_SERVICE\" | tr - _).main:app\" --host 0.0.0.0 --port 8000 --proxy-headers --no-server-header"]
