"""Identity guards: production key/seed requirements and API-key scope containment."""

from __future__ import annotations

import pytest
from argon2 import PasswordHasher
from identity_service.config import Settings
from identity_service.keys import SigningKey
from identity_service.models import OAuthClient
from identity_service.service import IdentityService
from pydantic import ValidationError

from finsight_common.errors import AuthorizationError

_PEM = SigningKey(None, "test").private_pem
_STRONG = "x" * 40


def _settings(**overrides) -> Settings:
    return Settings(_env_file=None, **overrides)


class _FakeSession:
    def __init__(self, existing: dict | None = None) -> None:
        self.added: list = []
        self._existing = existing or {}

    def add(self, obj) -> None:
        self.added.append(obj)

    async def flush(self) -> None:
        return None

    async def get(self, model, key):
        return self._existing.get((model, key))


# --- settings -------------------------------------------------------------


def test_seed_client_is_off_by_default() -> None:
    s = _settings()
    assert s.seed_client_id is None
    assert s.seed_client_secret is None


def test_production_requires_signing_key() -> None:
    with pytest.raises(ValidationError, match="jwt_private_key_pem"):
        _settings(env="production")
    _settings(env="local")  # ephemeral key is fine locally


@pytest.mark.parametrize("secret", ["demo-secret", "change-me-please", "short-but-random"])
def test_production_rejects_weak_seed_secret(secret: str) -> None:
    with pytest.raises(ValidationError, match="seed_client_secret"):
        _settings(
            env="production",
            jwt_private_key_pem=_PEM,
            seed_client_id="demo-client",
            seed_client_secret=secret,
        )


def test_production_accepts_strong_seed_or_none() -> None:
    _settings(env="production", jwt_private_key_pem=_PEM)
    _settings(
        env="staging",
        jwt_private_key_pem=_PEM,
        seed_client_id="demo-client",
        seed_client_secret=_STRONG,
    )


# --- API keys -------------------------------------------------------------


def _identity() -> IdentityService:
    return IdentityService(_settings(), SigningKey(_PEM, "test"))


async def test_api_key_cannot_exceed_caller_scopes() -> None:
    session = _FakeSession()
    with pytest.raises(AuthorizationError, match="audit:read"):
        await _identity().create_api_key(
            session,  # type: ignore[arg-type]
            tenant_id="t1",
            client_id="c1",
            name="ci",
            requested_scopes=["data:write", "audit:read"],
            caller_scopes={"data:write", "api-keys:write"},
        )
    assert session.added == []


async def test_api_key_gets_requested_subset() -> None:
    session = _FakeSession()
    result = await _identity().create_api_key(
        session,  # type: ignore[arg-type]
        tenant_id="t1",
        client_id="c1",
        name="ci",
        requested_scopes=["graph:read", " data:write ", "graph:read"],
        caller_scopes={"data:write", "graph:read", "api-keys:write"},
    )
    assert result["scopes"] == ["data:write", "graph:read"]
    assert session.added[0].scopes == "data:write graph:read"


# --- seed client rotation ---------------------------------------------------


async def test_seed_client_secret_rotates_when_config_changes() -> None:
    ph = PasswordHasher()
    existing = OAuthClient(
        client_id="demo-client", tenant_id="tenant_demo", secret_hash=ph.hash("demo-secret")
    )
    session = _FakeSession({(OAuthClient, "demo-client"): existing})
    service = IdentityService(
        _settings(seed_client_id="demo-client", seed_client_secret=_STRONG),
        SigningKey(_PEM, "test"),
    )

    await service.ensure_seed_client(session)  # type: ignore[arg-type]

    assert ph.verify(existing.secret_hash, _STRONG)
    assert session.added == []
