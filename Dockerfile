# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Shared multi-stage image for every FinSight Python service.
# Build with:  docker build --build-arg SERVICE=identity-service -t finsight/identity .
# ---------------------------------------------------------------------------
ARG PYTHON_VERSION=3.12

FROM python:${PYTHON_VERSION}-slim AS base
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy
COPY --from=ghcr.io/astral-sh/uv:0.9.30 /uv /uvx /bin/

FROM base AS builder
ARG SERVICE
WORKDIR /app
# Copy only manifests first for layer caching.
COPY pyproject.toml uv.lock* ./
COPY libs/finsight-common/pyproject.toml libs/finsight-common/pyproject.toml
COPY services/${SERVICE}/pyproject.toml services/${SERVICE}/pyproject.toml
# Now the source.
COPY libs/finsight-common libs/finsight-common
COPY services/${SERVICE} services/${SERVICE}
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --package "${SERVICE}" --no-dev --frozen 2>/dev/null || \
    uv sync --package "${SERVICE}" --no-dev

FROM python:${PYTHON_VERSION}-slim AS runtime
ARG SERVICE
ENV PATH="/app/.venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1 \
    FINSIGHT_SERVICE=${SERVICE}
RUN groupadd --system app && useradd --system --gid app --uid 10001 app \
    && apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder --chown=app:app /app /app
USER app
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=4 \
    CMD curl -fsS http://localhost:8000/health || exit 1
# SERVICE dir name -> python module (identity-service -> identity_service)
CMD ["sh", "-c", "exec uvicorn \"$(echo \"$FINSIGHT_SERVICE\" | tr - _).main:app\" --host 0.0.0.0 --port 8000 --proxy-headers"]
