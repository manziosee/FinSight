"""Workspace members: role presets, tenant isolation and self-protection."""

from __future__ import annotations

import pytest
from argon2 import PasswordHasher
from identity_service.config import Settings
from identity_service.keys import SigningKey
from identity_service.models import OAuthClient
from identity_service.service import ROLE_SCOPES, IdentityService, member_view, role_of

from finsight_common.errors import (
    AuthorizationError,
    ConflictError,
    FinSightError,
    NotFoundError,
)

ADMIN = set(ROLE_SCOPES["admin"])


class _Session:
    def __init__(self, *clients: OAuthClient) -> None:
        self.rows = {c.client_id: c for c in clients}
        self.deleted: list[str] = []

    def add(self, obj: OAuthClient) -> None:
        self.rows[obj.client_id] = obj

    async def flush(self) -> None:
        return None

    async def get(self, model, key):
        return self.rows.get(key)

    async def delete(self, obj: OAuthClient) -> None:
        self.deleted.append(obj.client_id)
        self.rows.pop(obj.client_id, None)


def _svc() -> IdentityService:
    return IdentityService(Settings(_env_file=None), SigningKey(None, "test"))


def _client(cid: str, tenant: str = "t1", role: str = "viewer") -> OAuthClient:
    return OAuthClient(
        client_id=cid,
        tenant_id=tenant,
        secret_hash="x",
        scopes=" ".join(sorted(ROLE_SCOPES[role])),
        is_active=True,
    )


def test_roles_nest_and_admin_matches_seed_scopes() -> None:
    assert ROLE_SCOPES["viewer"] - {"audit:read"} < ROLE_SCOPES["analyst"]
    assert ROLE_SCOPES["analyst"] < ROLE_SCOPES["admin"]
    assert set(Settings(_env_file=None).seed_scopes.split()) == ROLE_SCOPES["admin"]
    assert role_of(ROLE_SCOPES["analyst"]) == "analyst"
    assert role_of({"graph:read"}) == "custom"


async def test_add_member_hashes_secret_and_sets_role() -> None:
    s = _Session()
    c = await _svc().add_member(
        s, tenant_id="t1", client_id="alice", role="viewer", caller_scopes=ADMIN, secret="pw"
    )
    assert PasswordHasher().verify(c.secret_hash, "pw")
    view = member_view(c, "admin")
    assert view["role"] == "viewer" and view["is_you"] is False


async def test_add_member_rejects_taken_names_unknown_roles_and_escalation() -> None:
    s = _Session(_client("alice", tenant="other"))
    svc = _svc()
    with pytest.raises(ConflictError):
        await svc.add_member(
            s, tenant_id="t1", client_id="alice", role="viewer", caller_scopes=ADMIN, secret="x"
        )
    with pytest.raises(FinSightError):
        await svc.add_member(
            s, tenant_id="t1", client_id="bob", role="owner", caller_scopes=ADMIN, secret="x"
        )
    with pytest.raises(AuthorizationError):
        await svc.add_member(
            s,
            tenant_id="t1",
            client_id="bob",
            role="admin",
            caller_scopes=set(ROLE_SCOPES["analyst"]) | {"members:manage"},
            secret="x",
        )


async def test_members_of_other_tenants_are_invisible() -> None:
    s = _Session(_client("eve", tenant="other"))
    with pytest.raises(NotFoundError):
        await _svc().reset_member_secret(s, tenant_id="t1", client_id="eve", secret="x")
    with pytest.raises(NotFoundError):
        await _svc().remove_member(s, tenant_id="t1", client_id="eve", caller="admin")
    assert "eve" in s.rows


async def test_cannot_change_or_remove_yourself() -> None:
    s = _Session(_client("admin", role="admin"))
    svc = _svc()
    with pytest.raises(AuthorizationError):
        await svc.update_member(
            s,
            tenant_id="t1",
            client_id="admin",
            caller="admin",
            caller_scopes=ADMIN,
            is_active=False,
        )
    with pytest.raises(AuthorizationError):
        await svc.remove_member(s, tenant_id="t1", client_id="admin", caller="admin")


async def test_update_role_suspend_and_remove() -> None:
    s = _Session(_client("bob"))
    svc = _svc()
    c = await svc.update_member(
        s,
        tenant_id="t1",
        client_id="bob",
        caller="admin",
        caller_scopes=ADMIN,
        role="analyst",
        is_active=False,
    )
    assert role_of(c.scopes.split()) == "analyst" and c.is_active is False
    await svc.remove_member(s, tenant_id="t1", client_id="bob", caller="admin")
    assert s.deleted == ["bob"]


async def test_grant_scopes_keeps_secret() -> None:
    c = _client("admin", role="analyst")
    c.secret_hash = "keep"
    s = _Session(c)
    await _svc().grant_scopes(s, client_id="admin", scopes=["members:manage", "audit:read"])
    assert c.secret_hash == "keep"
    assert {"members:manage", "audit:read"} <= set(c.scopes.split())
