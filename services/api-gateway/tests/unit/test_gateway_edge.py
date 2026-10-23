"""Gateway edge behaviour: public-path matching, routing, client IP and token throttling."""

from __future__ import annotations

import pytest
from api_gateway import main
from api_gateway.config import Settings
from fastapi.testclient import TestClient
from pydantic import ValidationError


class _FakeLimiter:
    def __init__(self, allow_token: bool = True) -> None:
        self.calls: list[tuple[str, int | None]] = []
        self._allow_token = allow_token

    async def check(self, key: str, *, limit: int | None = None) -> tuple[bool, int]:
        self.calls.append((key, limit))
        if key.startswith("token:"):
            return self._allow_token, 0
        return True, 100


@pytest.fixture
def limiter(monkeypatch: pytest.MonkeyPatch) -> _FakeLimiter:
    fake = _FakeLimiter()
    monkeypatch.setattr(main, "_limiter", fake)
    return fake


@pytest.fixture
def client(limiter: _FakeLimiter):
    with TestClient(main.app) as c:  # runs startup so the upstream client exists
        yield c


def test_upstream_matching_requires_a_path_boundary() -> None:
    assert main._upstream_for("/v1/data/upload")[1] == "ingestion"
    assert main._upstream_for("/v1/data") is not None
    assert main._upstream_for("/v1/datafoo") is None


def test_lookalike_of_public_path_still_requires_auth(client: TestClient) -> None:
    resp = client.post("/v1/auth/token-admin")
    assert resp.status_code == 401


def test_internal_refresh_endpoint_is_gone(client: TestClient) -> None:
    assert client.post("/internal/openapi/refresh").status_code in (404, 405)


def test_token_endpoint_is_throttled_per_client_ip(
    client: TestClient, limiter: _FakeLimiter
) -> None:
    limiter._allow_token = False
    resp = client.post(
        "/v1/auth/token",
        data={"grant_type": "client_credentials"},
        headers={"x-forwarded-for": "198.51.100.9"},
    )
    assert resp.status_code == 429
    assert resp.headers["retry-after"] == "60"
    assert limiter.calls[0] == ("token:ip:198.51.100.9", main.settings.token_rate_limit_per_minute)


class _Req:
    def __init__(self, xff: str | None, peer: str = "10.0.0.2") -> None:
        self.headers = {"x-forwarded-for": xff} if xff is not None else {}
        self.client = type("C", (), {"host": peer})()


@pytest.mark.parametrize(
    ("hops", "xff", "expected"),
    [
        (1, "203.0.113.5", "203.0.113.5"),
        # A spoofed left-most entry is ignored: our proxy appended the real peer.
        (1, "1.2.3.4, 203.0.113.5", "203.0.113.5"),
        (2, "1.2.3.4, 203.0.113.5, 10.0.0.9", "203.0.113.5"),
        (1, None, "10.0.0.2"),
        (0, "1.2.3.4", "10.0.0.2"),
    ],
)
def test_client_ip_uses_trusted_hop_from_the_right(
    monkeypatch: pytest.MonkeyPatch, hops: int, xff: str | None, expected: str
) -> None:
    monkeypatch.setattr(main.settings, "trusted_proxy_hops", hops)
    assert main._client_ip(_Req(xff)) == expected  # type: ignore[arg-type]


def test_production_gateway_requires_explicit_hosts() -> None:
    with pytest.raises(ValidationError, match="trusted_hosts"):
        Settings(_env_file=None, env="production", trusted_hosts=["*"])
    Settings(_env_file=None, env="production", trusted_hosts=["api.finsight.dev"])
