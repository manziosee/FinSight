from __future__ import annotations

from functools import lru_cache

from finsight_common.config import ServiceSettings


class Settings(ServiceSettings):
    service_name: str = "normalization-service"

    normalization_db_dsn: str = (
        "postgresql+asyncpg://finsight:finsight_local_pw@localhost:5432/normalization"
    )
    s3_endpoint_url: str | None = "http://localhost:9000"
    s3_region: str = "us-east-1"
    s3_access_key_id: str = "finsight"
    s3_secret_access_key: str = "finsight_local_pw"
    s3_raw_bucket: str = "finsight-raw-data"


@lru_cache
def get_settings() -> Settings:
    return Settings()
