"""Edge-hardening defaults in the shared settings and app factory."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from finsight_common.app import create_app
from finsight_common.config import ServiceSettings


def _settings(**overrides) -> ServiceSettings:
    return ServiceSettings(_env_file=None, otel_exporter_otlp_endpoint=None, **overrides)


def test_cors_is_off_by_default() -> None:
    assert _settings().cors_allow_origins == []
    client = TestClient(create_app(settings=_settings()))
    resp = client.get("/health", headers={"origin": "https://evil.example"})
    assert "access-control-allow-origin" not in resp.headers


def test_wildcard_cors_rejected_in_production() -> None:
    with pytest.raises(ValidationError, match="explicit origins"):
        _settings(env="production", cors_allow_origins=["*"])
    _settings(env="local", cors_allow_origins=["*"])  # still allowed for local dev


def test_cors_allows_only_listed_origins_without_credentials() -> None:
    app = create_app(settings=_settings(cors_allow_origins=["https://console.example"]))
    client = TestClient(app)

    ok = client.get("/health", headers={"origin": "https://console.example"})
    assert ok.headers["access-control-allow-origin"] == "https://console.example"
    assert "access-control-allow-credentials" not in ok.headers

    denied = client.get("/health", headers={"origin": "https://evil.example"})
    assert "access-control-allow-origin" not in denied.headers


def test_trusted_hosts_enforced_except_for_probes() -> None:
    app = create_app(settings=_settings(trusted_hosts=["api.example"]))
    by_ip = TestClient(app, base_url="http://10.0.0.7:8000")

    # k8s / Fly probes and Prometheus address the pod by IP.
    assert by_ip.get("/health").status_code == 200
    assert by_ip.get("/ready").status_code == 200
    assert by_ip.get("/metrics").status_code == 200
    # Everything else must carry an allowed Host header.
    assert by_ip.get("/docs").status_code == 400
    assert TestClient(app, base_url="http://api.example").get("/docs").status_code == 200
