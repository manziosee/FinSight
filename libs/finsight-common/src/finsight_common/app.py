"""Opinionated FastAPI application factory used by every service."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from finsight_common.config import ServiceSettings
from finsight_common.errors import install_exception_handlers
from finsight_common.health import ReadyCheck, build_health_router
from finsight_common.logging import configure_logging, get_logger
from finsight_common.telemetry import configure_telemetry

_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    "Cache-Control": "no-store",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Any, call_next: Any) -> Any:
        response = await call_next(request)
        for key, value in _SECURITY_HEADERS.items():
            response.headers.setdefault(key, value)
        return response


def create_app(
    *,
    settings: ServiceSettings,
    version: str = "0.1.0",
    title: str | None = None,
    description: str = "",
    ready_checks: dict[str, ReadyCheck] | None = None,
    on_startup: Callable[[], Awaitable[None]] | None = None,
    on_shutdown: Callable[[], Awaitable[None]] | None = None,
) -> FastAPI:
    configure_logging(
        settings.service_name,
        settings.log_level,
        json_output=settings.env != "local",
    )
    log = get_logger(settings.service_name)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        log.info("service.starting", env=settings.env, version=version)
        if on_startup:
            await on_startup()
        yield
        if on_shutdown:
            await on_shutdown()
        log.info("service.stopped")

    app = FastAPI(
        title=title or settings.service_name,
        version=version,
        description=description,
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.trusted_hosts)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    install_exception_handlers(app)
    configure_telemetry(app, settings.service_name, settings.otel_exporter_otlp_endpoint)
    app.include_router(build_health_router(version=version, ready_checks=ready_checks))

    return app
