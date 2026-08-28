from __future__ import annotations

from functools import lru_cache

from finsight_common.config import ServiceSettings


class Settings(ServiceSettings):
    service_name: str = "ingestion-service"

    ingestion_db_dsn: str = (
        "postgresql+asyncpg://finsight:finsight_local_pw@localhost:5432/ingestion"
    )
    s3_endpoint_url: str | None = "http://localhost:9000"
    s3_region: str = "us-east-1"
    s3_access_key_id: str = "finsight"
    s3_secret_access_key: str = "finsight_local_pw"
    s3_raw_bucket: str = "finsight-raw-data"
    # "aws:kms" / "AES256" in prod; empty locally (MinIO has no KMS). Bucket-level
    # default encryption is enforced by Terraform for the real S3 bucket.
    s3_server_side_encryption: str = ""

    max_upload_bytes: int = 50 * 1024 * 1024
    allowed_content_types: list[str] = [
        "text/csv",
        "application/json",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "application/pdf",
        "text/plain",
    ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
