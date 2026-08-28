from __future__ import annotations

from functools import lru_cache

from finsight_common.config import ServiceSettings


class Settings(ServiceSettings):
    service_name: str = "identity-service"

    identity_db_dsn: str = "postgresql+asyncpg://finsight:finsight_local_pw@localhost:5432/identity"

    # RS256 signing key. In prod this is mounted from AWS Secrets Manager.
    # If unset, a keypair is generated at startup and kept in-memory (dev only).
    jwt_private_key_pem: str | None = None
    jwt_key_id: str = "finsight-dev-key"
    access_token_ttl_seconds: int = 3600

    # Local convenience: seed one client_credentials client on startup.
    seed_client_id: str | None = "demo-client"
    seed_client_secret: str | None = "demo-secret"
    seed_tenant_id: str = "tenant_demo"
    seed_scopes: str = (
        "data:write transactions:read transactions:write payments:match "
        "reconciliation:run reconciliation:read graph:read anomalies:read "
        "financial:ask forecast:run actions:execute"
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
