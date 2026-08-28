from __future__ import annotations

from functools import lru_cache

from finsight_common.config import ServiceSettings


class Settings(ServiceSettings):
    service_name: str = "reconciliation-service"

    reconciliation_db_dsn: str = (
        "postgresql+asyncpg://finsight:finsight_local_pw@localhost:5432/reconciliation"
    )
    min_confidence: float = 0.6


@lru_cache
def get_settings() -> Settings:
    return Settings()
