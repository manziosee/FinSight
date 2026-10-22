"""12-factor configuration base. Every service subclasses :class:`ServiceSettings`."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["local", "test", "staging", "production"]


class ServiceSettings(BaseSettings):
    """Shared settings. Read from environment with the ``FINSIGHT_`` prefix."""

    model_config = SettingsConfigDict(
        env_prefix="FINSIGHT_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    service_name: str = "finsight-service"
    env: Environment = "local"
    log_level: str = "INFO"
    debug: bool = False

    # Neutral fallbacks only. Real records should carry their own currency and timezone.
    # XXX is the ISO 4217 code for an unknown/no currency; it avoids silently labeling
    # records from another country as USD.
    default_currency: str = Field(default="XXX", min_length=3, max_length=3)
    default_timezone: str = "UTC"

    @field_validator("default_currency")
    @classmethod
    def _normalize_default_currency(cls, value: str) -> str:
        return value.upper()

    @field_validator("default_timezone")
    @classmethod
    def _validate_default_timezone(cls, value: str) -> str:
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("default_timezone must be a valid IANA timezone") from exc
        return value

    # Observability
    otel_exporter_otlp_endpoint: str | None = None
    metrics_enabled: bool = True

    # AuthN/Z
    jwt_issuer: str = "https://identity.finsight.local"
    jwt_audience: str = "finsight-api"
    jwks_url: str = "http://identity-service:8000/.well-known/jwks.json"

    # Infra (only what a given service needs is actually used)
    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_security_protocol: str = "PLAINTEXT"  # or SASL_SSL for Upstash/Confluent Cloud
    kafka_sasl_mechanism: str | None = None  # e.g. SCRAM-SHA-256, PLAIN
    kafka_sasl_username: str | None = None
    kafka_sasl_password: str | None = None
    kafka_enable_idempotence: bool = True  # set false on brokers without idempotent producer
    redis_url: str = "redis://localhost:6379/0"

    # Security
    field_encryption_key: str | None = None
    cors_allow_origins: list[str] = Field(default_factory=lambda: ["*"])
    trusted_hosts: list[str] = Field(default_factory=lambda: ["*"])

    @property
    def is_production(self) -> bool:
        return self.env in ("staging", "production")


@lru_cache
def get_settings() -> ServiceSettings:  # pragma: no cover - trivial
    return ServiceSettings()
