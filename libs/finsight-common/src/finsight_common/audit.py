"""Audit middleware — emits an ``audit.recorded`` event for every state-changing request.

Wire it by passing ``audit_publisher`` to :func:`finsight_common.app.create_app`; the
publisher is an async callable that takes an :class:`~finsight_common.events.EventEnvelope`.
Services without an event bus can pass ``None`` (no-op).
"""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import Awaitable, Callable
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from finsight_common.events import AuditRecorded, EventEnvelope
from finsight_common.logging import get_logger

_log = get_logger(__name__)
_MUTATING = {"POST", "PUT", "PATCH", "DELETE"}
_SKIP_PATHS = ("/health", "/ready", "/metrics", "/docs", "/redoc", "/openapi.json")

AuditPublisher = Callable[[EventEnvelope[AuditRecorded]], Awaitable[None]]


class AuditMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: Any, *, service: str, publisher: AuditPublisher | None) -> None:
        super().__init__(app)
        self._service = service
        self._publisher = publisher
        self._pending: set[asyncio.Task] = set()

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response = await call_next(request)
        if (
            self._publisher is None
            or request.method not in _MUTATING
            or request.url.path.startswith(_SKIP_PATHS)
        ):
            return response

        principal = getattr(request.state, "principal", None)
        outcome = (
            "allow"
            if response.status_code < 400
            else "deny"
            if response.status_code in (401, 403)
            else "error"
        )
        event = EventEnvelope[AuditRecorded](
            type="audit.recorded",
            tenant_id=getattr(principal, "tenant_id", "unknown"),
            producer=self._service,
            data=AuditRecorded(
                actor=getattr(principal, "subject", "anonymous"),
                action=f"{request.method} {request.url.path}",
                resource=request.url.path,
                outcome=outcome,
                request_id=request.headers.get("x-request-id"),
                attributes={"status": response.status_code, "service": self._service},
            ),
        )

        # fire-and-forget: a slow/unavailable bus must never add request latency
        async def _emit() -> None:
            with contextlib.suppress(Exception):
                await self._publisher(event)  # type: ignore[misc]

        task = asyncio.create_task(_emit())
        self._pending.add(task)
        task.add_done_callback(self._pending.discard)
        return response
