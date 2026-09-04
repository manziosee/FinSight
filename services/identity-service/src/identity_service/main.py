from __future__ import annotations

import asyncio
import datetime as dt
import json
from typing import Annotated

import jwt
from fastapi import Depends, Form, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from finsight_common.app import create_app
from finsight_common.auth import Principal
from finsight_common.db import Database
from finsight_common.errors import AuthenticationError, AuthorizationError
from finsight_common.events import AuditRecorded, EventEnvelope, topic_for
from finsight_common.logging import get_logger
from finsight_common.messaging import KafkaConnection, KafkaEventBus
from identity_service import __version__
from identity_service.config import get_settings
from identity_service.keys import SigningKey
from identity_service.models import AuditEvent
from identity_service.service import IdentityService

settings = get_settings()
db = Database(settings.identity_db_dsn)
signing_key = SigningKey(settings.jwt_private_key_pem, settings.jwt_key_id)
identity = IdentityService(settings, signing_key)
bus = KafkaEventBus(
    KafkaConnection.from_settings(settings),
    client_id="identity-service",
    group_id="identity-service-audit",
)
_consumer_task: asyncio.Task | None = None


async def _on_audit(body: dict) -> None:
    env = EventEnvelope[AuditRecorded].model_validate(body)
    d = env.data
    async with db.session() as session:
        session.add(
            AuditEvent(
                tenant_id=env.tenant_id,
                actor=d.actor,
                action=d.action,
                resource=d.resource,
                outcome=d.outcome,
                producer=env.producer,
                attributes=json.dumps(d.attributes),
                occurred_at=env.occurred_at,
            )
        )


async def _audit_publisher(event: EventEnvelope[AuditRecorded]) -> None:
    await bus.publish(event)


# identity verifies tokens with its OWN in-memory key — never via a self HTTP call to
# /.well-known/jwks.json (that would deadlock the single event loop).
async def _local_principal(request: Request) -> Principal:
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        raise AuthenticationError("no bearer token")
    try:
        claims = jwt.decode(
            header.split(" ", 1)[1].strip(),
            signing_key.public_pem,
            algorithms=["RS256"],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
        )
    except jwt.PyJWTError as exc:
        raise AuthenticationError(f"invalid token: {exc}") from exc
    if not claims.get("tenant_id"):
        raise AuthenticationError("token missing tenant_id")
    principal = Principal(
        subject=str(claims.get("sub", "?")),
        tenant_id=str(claims["tenant_id"]),
        scopes=set(str(claims.get("scope", "")).split()),
    )
    request.state.principal = principal
    return principal


def _require(*scopes: str):
    async def _dep(request: Request) -> Principal:
        principal = await _local_principal(request)
        missing = set(scopes) - principal.scopes
        if missing:
            raise AuthorizationError(f"missing scope(s): {', '.join(sorted(missing))}")
        return principal

    return _dep


async def _startup() -> None:
    if not settings.is_production:  # prod schema is managed by the alembic migration Job
        await db.create_all()
    async with db.session() as session:
        await identity.ensure_seed_client(session)
    try:
        await bus.start()
        bus.subscribe(topic_for(AuditRecorded), _on_audit)
        global _consumer_task
        _consumer_task = asyncio.create_task(bus.run_consumers())
    except Exception as exc:
        get_logger("identity-service").warning("audit.consumer_unavailable", error=str(exc))


async def _shutdown() -> None:
    if _consumer_task:
        _consumer_task.cancel()
    await bus.stop()
    await db.dispose()


app = create_app(
    settings=settings,
    version=__version__,
    title="FinSight Identity Service",
    description="Issues OAuth2 client-credentials tokens and manages API keys.",
    ready_checks={"database": db.ping},
    on_startup=_startup,
    on_shutdown=_shutdown,
    audit_publisher=_audit_publisher,
)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    expires_in: int
    scope: str


class ApiKeyCreate(BaseModel):
    name: str = Field(examples=["ci-pipeline"])
    scopes: list[str] = Field(default_factory=list)


class ApiKeyCreated(BaseModel):
    id: str
    api_key: str
    name: str
    scopes: list[str]


class IntrospectRequest(BaseModel):
    api_key: str


@app.post("/v1/auth/token", response_model=TokenResponse, tags=["auth"])
async def token(
    grant_type: Annotated[str, Form()],
    client_id: Annotated[str, Form()],
    client_secret: Annotated[str, Form()],
    scope: Annotated[str | None, Form()] = None,
) -> TokenResponse:
    if grant_type != "client_credentials":
        from finsight_common.errors import FinSightError

        raise FinSightError("only grant_type=client_credentials is supported")
    async with db.session() as session:
        result = await identity.issue_client_token(session, client_id, client_secret, scope)
    return TokenResponse(**result)


@app.post(
    "/v1/api-keys",
    response_model=ApiKeyCreated,
    status_code=201,
    tags=["api-keys"],
)
async def create_api_key(
    body: ApiKeyCreate,
    principal: Principal = Depends(_require("api-keys:write")),
) -> ApiKeyCreated:
    async with db.session() as session:
        result = await identity.create_api_key(
            session,
            tenant_id=principal.tenant_id,
            client_id=principal.subject,
            name=body.name,
            scopes=" ".join(body.scopes),
        )
    return ApiKeyCreated(**result)


@app.post("/v1/api-keys/introspect", tags=["api-keys"], include_in_schema=False)
async def introspect(body: IntrospectRequest) -> dict:
    async with db.session() as session:
        return await identity.introspect_api_key(session, body.api_key)


@app.get("/.well-known/jwks.json", tags=["auth"])
async def jwks() -> dict:
    return signing_key.jwks()


class AuditEntry(BaseModel):
    tenant_id: str
    actor: str
    action: str
    resource: str
    outcome: str
    producer: str
    occurred_at: dt.datetime


@app.get("/v1/audit", response_model=list[AuditEntry], tags=["audit"])
async def list_audit(
    limit: int = Query(default=100, le=1000),
    principal: Principal = Depends(_require("audit:read")),
) -> list[AuditEntry]:
    async with db.session() as session:
        rows = (
            (
                await session.execute(
                    select(AuditEvent)
                    .where(AuditEvent.tenant_id == principal.tenant_id)
                    .order_by(AuditEvent.occurred_at.desc())
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
    return [
        AuditEntry(
            tenant_id=r.tenant_id,
            actor=r.actor,
            action=r.action,
            resource=r.resource,
            outcome=r.outcome,
            producer=r.producer,
            occurred_at=r.occurred_at,
        )
        for r in rows
    ]
