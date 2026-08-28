"""Liveness / readiness / metrics routers mounted by every service."""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from fastapi import APIRouter, Response, status
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

ReadyCheck = Callable[[], Awaitable[bool]]


def build_health_router(
    *,
    version: str,
    ready_checks: dict[str, ReadyCheck] | None = None,
    metrics: bool = True,
) -> APIRouter:
    router = APIRouter(tags=["ops"])
    checks = ready_checks or {}

    @router.get("/health", summary="Liveness probe")
    async def health() -> dict[str, str]:
        return {"status": "ok", "version": version}

    @router.get("/ready", summary="Readiness probe")
    async def ready(response: Response) -> dict[str, object]:
        results: dict[str, bool] = {}
        for name, check in checks.items():
            try:
                results[name] = await check()
            except Exception:
                results[name] = False
        ok = all(results.values()) if results else True
        if not ok:
            response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "ready" if ok else "degraded", "checks": results}

    if metrics:

        @router.get("/metrics", include_in_schema=False)
        async def prometheus_metrics() -> Response:
            return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    return router
