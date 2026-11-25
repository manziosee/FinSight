"""Identity domain logic: client auth, token minting, API-key lifecycle."""

from __future__ import annotations

import datetime as dt
from collections.abc import Iterable

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from finsight_common.errors import (
    AuthenticationError,
    AuthorizationError,
    ConflictError,
    FinSightError,
    NotFoundError,
)
from finsight_common.security import generate_api_key, hash_api_key
from identity_service.config import Settings
from identity_service.keys import SigningKey
from identity_service.models import ApiKey, OAuthClient, Tenant

_ph = PasswordHasher()

# --- workspace members --------------------------------------------------------------------
# A member is a client_credentials client in the caller's tenant. Roles are preset scope
# bundles, so no schema change is needed; anything else reads back as "custom".
_READ = {
    "transactions:read",
    "reconciliation:read",
    "graph:read",
    "anomalies:read",
    "financial:ask",
}
_ANALYST = _READ | {
    "data:write",
    "transactions:write",
    "payments:match",
    "reconciliation:run",
    "forecast:run",
    "actions:execute",
}
ROLE_SCOPES: dict[str, frozenset[str]] = {
    "viewer": frozenset(_READ | {"audit:read"}),
    "analyst": frozenset(_ANALYST),
    "admin": frozenset(_ANALYST | {"api-keys:write", "audit:read", "members:manage"}),
}
MEMBER_ID_PATTERN = r"^[a-z0-9][a-z0-9._-]{2,63}$"


def role_of(scopes: Iterable[str]) -> str:
    have = frozenset(scopes)
    return next((r for r, s in ROLE_SCOPES.items() if s == have), "custom")


def member_view(client: OAuthClient, caller: str) -> dict:
    scopes = sorted(client.scopes.split())
    return {
        "client_id": client.client_id,
        "role": role_of(scopes),
        "scopes": scopes,
        "is_active": client.is_active,
        "created_at": client.created_at,
        "is_you": client.client_id == caller,
    }


class IdentityService:
    def __init__(self, settings: Settings, signing_key: SigningKey) -> None:
        self._settings = settings
        self._key = signing_key

    # --- OAuth2 client credentials ----------------------------------------

    async def issue_client_token(
        self, session: AsyncSession, client_id: str, client_secret: str, scope: str | None
    ) -> dict:
        client = await session.get(OAuthClient, client_id)
        if not client or not client.is_active:
            raise AuthenticationError("unknown or inactive client")
        try:
            _ph.verify(client.secret_hash, client_secret)
        except VerifyMismatchError as exc:
            raise AuthenticationError("invalid client credentials") from exc

        granted = set(client.scopes.split())
        requested = set(scope.split()) if scope else granted
        effective = granted & requested
        if not effective:
            raise AuthenticationError("no overlapping scopes granted")

        now = dt.datetime.now(dt.UTC)
        claims = {
            "iss": self._settings.jwt_issuer,
            "aud": self._settings.jwt_audience,
            "sub": client_id,
            "tenant_id": client.tenant_id,
            "scope": " ".join(sorted(effective)),
            "iat": int(now.timestamp()),
            "exp": int(
                (now + dt.timedelta(seconds=self._settings.access_token_ttl_seconds)).timestamp()
            ),
        }
        token = jwt.encode(
            claims,
            self._key.private_pem,
            algorithm="RS256",
            headers={"kid": self._key.key_id},
        )
        return {
            "access_token": token,
            "token_type": "Bearer",
            "expires_in": self._settings.access_token_ttl_seconds,
            "scope": claims["scope"],
        }

    # --- API keys --------------------------------------------------------

    async def create_api_key(
        self,
        session: AsyncSession,
        *,
        tenant_id: str,
        client_id: str,
        name: str,
        requested_scopes: Iterable[str],
        caller_scopes: set[str],
    ) -> dict:
        # A key can never carry more authority than the caller minting it.
        requested = {s.strip() for s in requested_scopes if s.strip()}
        excess = requested - caller_scopes
        if excess:
            raise AuthorizationError(
                f"cannot grant scope(s) the caller does not hold: {', '.join(sorted(excess))}"
            )
        scopes = " ".join(sorted(requested))
        raw, hashed = generate_api_key()
        record = ApiKey(
            tenant_id=tenant_id,
            client_id=client_id,
            name=name,
            key_hash=hashed,
            scopes=scopes,
        )
        session.add(record)
        await session.flush()
        return {"id": record.id, "api_key": raw, "scopes": scopes.split(), "name": name}

    async def introspect_api_key(self, session: AsyncSession, raw_key: str) -> dict:
        stmt = select(ApiKey).where(ApiKey.key_hash == hash_api_key(raw_key))
        record = (await session.execute(stmt)).scalar_one_or_none()
        if not record or not record.is_active:
            return {"active": False}
        record.last_used_at = dt.datetime.now(dt.UTC)
        return {
            "active": True,
            "client_id": record.client_id,
            "tenant_id": record.tenant_id,
            "scopes": record.scopes.split(),
        }

    # --- bootstrap ------------------------------------------------------

    async def ensure_seed_client(self, session: AsyncSession) -> None:
        s = self._settings
        if not (s.seed_client_id and s.seed_client_secret):
            return
        existing = await session.get(OAuthClient, s.seed_client_id)
        if existing:
            # Changing the configured secret rotates it (e.g. away from a demo default).
            try:
                _ph.verify(existing.secret_hash, s.seed_client_secret)
            except VerifyMismatchError:
                existing.secret_hash = _ph.hash(s.seed_client_secret)
            return
        if not await session.get(Tenant, s.seed_tenant_id):
            session.add(Tenant(id=s.seed_tenant_id, name="Demo Tenant"))
        session.add(
            OAuthClient(
                client_id=s.seed_client_id,
                tenant_id=s.seed_tenant_id,
                secret_hash=_ph.hash(s.seed_client_secret),
                scopes=s.seed_scopes,
            )
        )

    async def upsert_client(
        self,
        session: AsyncSession,
        *,
        client_id: str,
        client_secret: str,
        tenant_id: str,
        scopes: Iterable[str],
        tenant_name: str | None = None,
    ) -> OAuthClient:
        """Create a client_credentials client, or rotate its secret/scopes if it exists."""
        scope_str = " ".join(sorted({s.strip() for s in scopes if s.strip()}))
        if not await session.get(Tenant, tenant_id):
            session.add(Tenant(id=tenant_id, name=tenant_name or tenant_id))
        client = await session.get(OAuthClient, client_id)
        if client:
            client.secret_hash = _ph.hash(client_secret)
            client.scopes = scope_str
            client.tenant_id = tenant_id
            client.is_active = True
        else:
            client = OAuthClient(
                client_id=client_id,
                tenant_id=tenant_id,
                secret_hash=_ph.hash(client_secret),
                scopes=scope_str,
            )
            session.add(client)
        await session.flush()
        return client

    # --- members ---------------------------------------------------------------------------

    @staticmethod
    def _role_scopes(role: str, caller_scopes: set[str]) -> frozenset[str]:
        scopes = ROLE_SCOPES.get(role)
        if scopes is None:
            raise FinSightError(f"unknown role '{role}'")
        if not scopes <= caller_scopes:
            raise AuthorizationError("you can't give someone more access than you have")
        return scopes

    async def _member(self, session: AsyncSession, tenant_id: str, client_id: str) -> OAuthClient:
        client = await session.get(OAuthClient, client_id)
        if client is None or client.tenant_id != tenant_id:
            raise NotFoundError(f"member '{client_id}' not found")
        return client

    async def list_members(self, session: AsyncSession, tenant_id: str) -> list[OAuthClient]:
        rows = await session.execute(
            select(OAuthClient)
            .where(OAuthClient.tenant_id == tenant_id)
            .order_by(OAuthClient.created_at)
        )
        return list(rows.scalars().all())

    async def add_member(
        self,
        session: AsyncSession,
        *,
        tenant_id: str,
        client_id: str,
        role: str,
        caller_scopes: set[str],
        secret: str,
    ) -> OAuthClient:
        scopes = self._role_scopes(role, caller_scopes)
        if await session.get(OAuthClient, client_id):
            raise ConflictError(f"the username '{client_id}' is already taken")
        client = OAuthClient(
            client_id=client_id,
            tenant_id=tenant_id,
            secret_hash=_ph.hash(secret),
            scopes=" ".join(sorted(scopes)),
            is_active=True,
        )
        session.add(client)
        await session.flush()
        return client

    async def update_member(
        self,
        session: AsyncSession,
        *,
        tenant_id: str,
        client_id: str,
        caller: str,
        caller_scopes: set[str],
        role: str | None = None,
        is_active: bool | None = None,
    ) -> OAuthClient:
        if client_id == caller:
            raise AuthorizationError("you can't change your own access")
        client = await self._member(session, tenant_id, client_id)
        if role is not None:
            client.scopes = " ".join(sorted(self._role_scopes(role, caller_scopes)))
        if is_active is not None:
            client.is_active = is_active
        await session.flush()
        return client

    async def reset_member_secret(
        self, session: AsyncSession, *, tenant_id: str, client_id: str, secret: str
    ) -> OAuthClient:
        client = await self._member(session, tenant_id, client_id)
        client.secret_hash = _ph.hash(secret)
        await session.flush()
        return client

    async def remove_member(
        self, session: AsyncSession, *, tenant_id: str, client_id: str, caller: str
    ) -> None:
        if client_id == caller:
            raise AuthorizationError("you can't remove yourself")
        client = await self._member(session, tenant_id, client_id)
        await session.delete(client)
        await session.flush()

    async def grant_scopes(
        self, session: AsyncSession, *, client_id: str, scopes: Iterable[str]
    ) -> OAuthClient:
        """Add scopes to an existing client without touching its secret."""
        client = await session.get(OAuthClient, client_id)
        if client is None:
            raise NotFoundError(f"client '{client_id}' not found")
        merged = set(client.scopes.split()) | {s.strip() for s in scopes if s.strip()}
        client.scopes = " ".join(sorted(merged))
        await session.flush()
        return client

    async def get_tenant(self, session: AsyncSession, tenant_id: str) -> Tenant:
        tenant = await session.get(Tenant, tenant_id)
        if not tenant:
            raise NotFoundError(f"tenant {tenant_id} not found")
        return tenant
