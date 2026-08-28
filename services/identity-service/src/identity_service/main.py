from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Form
from pydantic import BaseModel, Field

from finsight_common.app import create_app
from finsight_common.auth import require_scopes
from finsight_common.db import Database
from identity_service import __version__
from identity_service.config import get_settings
from identity_service.keys import SigningKey
from identity_service.service import IdentityService

settings = get_settings()
db = Database(settings.identity_db_dsn)
signing_key = SigningKey(settings.jwt_private_key_pem, settings.jwt_key_id)
identity = IdentityService(settings, signing_key)


async def _startup() -> None:
    if not settings.is_production:  # prod schema is managed by the alembic migration Job
        await db.create_all()
    async with db.session() as session:
        await identity.ensure_seed_client(session)


async def _shutdown() -> None:
    await db.dispose()


app = create_app(
    settings=settings,
    version=__version__,
    title="FinSight Identity Service",
    description="Issues OAuth2 client-credentials tokens and manages API keys.",
    ready_checks={"database": db.ping},
    on_startup=_startup,
    on_shutdown=_shutdown,
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
    principal=Depends(require_scopes("api-keys:write")),
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
