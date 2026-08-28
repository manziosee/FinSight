"""Identity domain logic: client auth, token minting, API-key lifecycle."""

from __future__ import annotations

import datetime as dt

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from finsight_common.errors import AuthenticationError, NotFoundError
from finsight_common.security import generate_api_key, hash_api_key
from identity_service.config import Settings
from identity_service.keys import SigningKey
from identity_service.models import ApiKey, OAuthClient, Tenant

_ph = PasswordHasher()


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
        self, session: AsyncSession, *, tenant_id: str, client_id: str, name: str, scopes: str
    ) -> dict:
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
        if await session.get(OAuthClient, s.seed_client_id):
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

    async def get_tenant(self, session: AsyncSession, tenant_id: str) -> Tenant:
        tenant = await session.get(Tenant, tenant_id)
        if not tenant:
            raise NotFoundError(f"tenant {tenant_id} not found")
        return tenant
