"""Authentication & authorization helpers shared by every service.

Two credential types are accepted:

* ``Authorization: Bearer <JWT>``  — RS256, verified against the identity-service JWKS.
* ``X-API-Key: <key>``             — opaque key, introspected against identity-service.

Both resolve to a :class:`Principal` carrying ``tenant_id`` and ``scopes``.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

import httpx
import jwt
from fastapi import Depends, Request
from jwt import PyJWKClient

from finsight_common.config import ServiceSettings, get_settings
from finsight_common.errors import AuthenticationError, AuthorizationError

_jwk_client: PyJWKClient | None = None
_apikey_cache: dict[str, tuple[float, Principal]] = {}
_APIKEY_TTL = 60.0


@dataclass(slots=True)
class Principal:
    subject: str
    tenant_id: str
    scopes: set[str] = field(default_factory=set)
    token_type: str = "bearer"

    def require(self, *needed: str) -> None:
        missing = set(needed) - self.scopes
        if missing:
            raise AuthorizationError(f"missing required scope(s): {', '.join(sorted(missing))}")


def _get_jwk_client(settings: ServiceSettings) -> PyJWKClient:
    global _jwk_client
    if _jwk_client is None:
        _jwk_client = PyJWKClient(settings.jwks_url, cache_keys=True, lifespan=300)
    return _jwk_client


def _principal_from_claims(claims: dict[str, Any]) -> Principal:
    tenant_id = claims.get("tenant_id") or claims.get("org_id")
    if not tenant_id:
        raise AuthenticationError("token is missing tenant_id claim")
    scope_claim = claims.get("scope", "")
    scopes = set(scope_claim.split()) if isinstance(scope_claim, str) else set(scope_claim)
    return Principal(
        subject=str(claims.get("sub", "unknown")),
        tenant_id=str(tenant_id),
        scopes=scopes,
        token_type="bearer",
    )


def _verify_jwt(token: str, settings: ServiceSettings) -> Principal:
    try:
        signing_key = _get_jwk_client(settings).get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
        )
    except jwt.PyJWTError as exc:
        raise AuthenticationError(f"invalid bearer token: {exc}") from exc
    return _principal_from_claims(claims)


async def _introspect_api_key(key: str, settings: ServiceSettings) -> Principal:
    cached = _apikey_cache.get(key)
    if cached and cached[0] > time.monotonic():
        return cached[1]
    introspect_url = settings.jwks_url.replace("/.well-known/jwks.json", "/v1/api-keys/introspect")
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(introspect_url, json={"api_key": key})
    if resp.status_code != 200 or not resp.json().get("active"):
        raise AuthenticationError("invalid or inactive API key")
    data = resp.json()
    principal = Principal(
        subject=data["client_id"],
        tenant_id=data["tenant_id"],
        scopes=set(data.get("scopes", [])),
        token_type="api_key",
    )
    _apikey_cache[key] = (time.monotonic() + _APIKEY_TTL, principal)
    return principal


async def get_principal(
    request: Request,
    settings: ServiceSettings = Depends(get_settings),
) -> Principal:
    """FastAPI dependency: resolve the caller or raise 401."""

    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        principal = _verify_jwt(auth_header.split(" ", 1)[1].strip(), settings)
    elif api_key := request.headers.get("x-api-key"):
        principal = await _introspect_api_key(api_key, settings)
    else:
        raise AuthenticationError("no credentials supplied")

    request.state.principal = principal
    return principal


def require_scopes(*scopes: str):
    """Dependency factory enforcing that the principal holds every listed scope."""

    async def _dep(principal: Principal = Depends(get_principal)) -> Principal:
        principal.require(*scopes)
        return principal

    return _dep
