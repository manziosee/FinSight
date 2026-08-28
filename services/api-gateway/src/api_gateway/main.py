from __future__ import annotations

import time

import httpx
from fastapi import Request, Response
from fastapi.responses import JSONResponse

from api_gateway import __version__
from api_gateway.config import get_settings
from api_gateway.openapi import build_aggregated_spec
from api_gateway.ratelimit import RateLimiter
from finsight_common.app import create_app
from finsight_common.auth import get_principal
from finsight_common.errors import AuthenticationError
from finsight_common.logging import get_logger

settings = get_settings()
log = get_logger("api-gateway")
_client: httpx.AsyncClient | None = None
_limiter = RateLimiter(settings.redis_url, settings.rate_limit_per_minute)
_aggregated_spec: dict | None = None
_spec_fetched_at: float = 0.0
_SPEC_TTL = 30.0

# Paths that do not require authentication at the edge.
_PUBLIC_PREFIXES = (
    "/v1/auth/token",
    "/.well-known/jwks.json",
    "/health",
    "/ready",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/metrics",
)


async def _startup() -> None:
    global _client
    _client = httpx.AsyncClient(timeout=settings.request_timeout_seconds)


async def _get_spec(force: bool = False) -> dict:
    """Aggregate downstream specs lazily; refresh on a short TTL (services boot async)."""
    global _aggregated_spec, _spec_fetched_at
    assert _client is not None
    stale = (time.monotonic() - _spec_fetched_at) > _SPEC_TTL
    thin = not _aggregated_spec or len(_aggregated_spec.get("paths", {})) < 5
    if force or stale or thin:
        _aggregated_spec = await build_aggregated_spec(_client, settings)
        _spec_fetched_at = time.monotonic()
    return _aggregated_spec


async def _shutdown() -> None:
    if _client:
        await _client.aclose()


app = create_app(
    settings=settings,
    version=__version__,
    title="FinSight API",
    description=(
        "The intelligence layer for financial data. One API to ingest, normalize, connect, "
        "reconcile, explain, detect, predict and act on fragmented financial data."
    ),
    on_startup=_startup,
    on_shutdown=_shutdown,
)

# Replace FastAPI's built-in /openapi.json (this service's own schema) with the
# aggregated public spec registered below.
app.router.routes = [r for r in app.router.routes if getattr(r, "path", None) != "/openapi.json"]


def _upstream_for(path: str) -> tuple[str, str] | None:
    for prefix, url, tag in sorted(settings.routes, key=lambda r: -len(r[0])):
        if path == prefix or path.startswith(prefix + "/") or path.startswith(prefix):
            return url, tag
    return None


@app.get("/openapi.json", include_in_schema=False)
async def aggregated_openapi() -> JSONResponse:
    return JSONResponse(await _get_spec())


@app.post("/internal/openapi/refresh", include_in_schema=False)
async def refresh_openapi() -> JSONResponse:
    spec = await _get_spec(force=True)
    return JSONResponse({"paths": len(spec.get("paths", {}))})


@app.api_route(
    "/v1/{full_path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    include_in_schema=False,
)
@app.api_route("/.well-known/jwks.json", methods=["GET"], include_in_schema=False)
async def proxy(request: Request, full_path: str = "") -> Response:
    assert _client is not None
    path = request.url.path
    target = _upstream_for(path)
    if target is None:
        return JSONResponse({"title": "Not Found", "status": 404}, status_code=404)
    upstream_url, _tag = target

    is_public = any(path.startswith(p) for p in _PUBLIC_PREFIXES)
    principal_key = request.client.host if request.client else "anon"
    if not is_public:
        try:
            principal = await get_principal(request, settings)
            principal_key = f"{principal.tenant_id}:{principal.subject}"
        except AuthenticationError as exc:
            return JSONResponse(
                {"title": "Unauthorized", "status": 401, "detail": exc.detail},
                status_code=401,
                media_type="application/problem+json",
            )

    allowed, remaining = await _limiter.check(principal_key)
    if not allowed:
        return JSONResponse({"title": "Too Many Requests", "status": 429}, status_code=429)

    body = await request.body()
    try:
        upstream = await _client.request(
            request.method,
            f"{upstream_url}{path}",
            content=body,
            params=request.query_params,
            headers={
                k: v
                for k, v in request.headers.items()
                if k.lower() not in {"host", "content-length"}
            },
        )
    except httpx.RequestError as exc:
        log.error("gateway.upstream_error", path=path, error=str(exc))
        return JSONResponse({"title": "Bad Gateway", "status": 502}, status_code=502)

    resp_headers = {
        k: v
        for k, v in upstream.headers.items()
        if k.lower() not in {"content-length", "transfer-encoding", "connection"}
    }
    resp_headers["X-RateLimit-Remaining"] = str(remaining)
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=resp_headers,
        media_type=upstream.headers.get("content-type"),
    )
