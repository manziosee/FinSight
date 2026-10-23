from __future__ import annotations

from functools import lru_cache

from pydantic import model_validator

from finsight_common.config import ServiceSettings

# Placeholder secrets that ship in example files; never acceptable outside local/test.
_KNOWN_WEAK_SECRETS = frozenset({"demo-secret", "change-me-please", "changeme", "secret"})
_MIN_PROD_SEED_SECRET_LEN = 32


class Settings(ServiceSettings):
    service_name: str = "identity-service"

    identity_db_dsn: str = "postgresql+asyncpg://finsight:finsight_local_pw@localhost:5432/identity"

    # RS256 signing key. In prod this is mounted from AWS Secrets Manager.
    # If unset, a keypair is generated at startup and kept in-memory (local/test only —
    # replicas would each mint a different key, so staging/production refuse to start).
    jwt_private_key_pem: str | None = None
    jwt_key_id: str = "finsight-dev-key"
    access_token_ttl_seconds: int = 3600

    # Optional bootstrap client_credentials client, created (or its secret rotated) on
    # startup. Off unless configured; .env.example sets a demo client for local use.
    seed_client_id: str | None = None
    seed_client_secret: str | None = None
    seed_tenant_id: str = "tenant_demo"
    seed_scopes: str = (
        "data:write transactions:read transactions:write payments:match "
        "reconciliation:run reconciliation:read graph:read anomalies:read "
        "financial:ask forecast:run actions:execute api-keys:write audit:read"
    )

    @model_validator(mode="after")
    def _production_identity_guards(self) -> Settings:
        if not self.is_production:
            return self
        if not self.jwt_private_key_pem:
            raise ValueError(
                "jwt_private_key_pem is required in staging/production "
                "(an ephemeral key breaks tokens across replicas and restarts)"
            )
        if self.seed_client_id and self.seed_client_secret:
            secret = self.seed_client_secret
            if secret.lower() in _KNOWN_WEAK_SECRETS or len(secret) < _MIN_PROD_SEED_SECRET_LEN:
                raise ValueError(
                    f"seed_client_secret must be at least {_MIN_PROD_SEED_SECRET_LEN} random "
                    "characters in staging/production (or leave the seed client unset)"
                )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
