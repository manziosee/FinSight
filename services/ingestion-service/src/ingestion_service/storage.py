"""Object-storage adapter (SeaweedFS locally, S3/Tigris in prod) via aioboto3."""

from __future__ import annotations

import aioboto3

from ingestion_service.config import Settings


class ObjectStore:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._session = aioboto3.Session()

    def _client(self):
        s = self._settings
        return self._session.client(
            "s3",
            endpoint_url=s.s3_endpoint_url,
            region_name=s.s3_region,
            aws_access_key_id=s.s3_access_key_id,
            aws_secret_access_key=s.s3_secret_access_key,
        )

    async def ensure_bucket(self) -> None:
        async with self._client() as client:
            try:
                await client.head_bucket(Bucket=self._settings.s3_raw_bucket)
            except Exception:
                await client.create_bucket(Bucket=self._settings.s3_raw_bucket)

    async def put(self, key: str, body: bytes, content_type: str) -> str:
        extra: dict[str, str] = {}
        if self._settings.s3_server_side_encryption:
            extra["ServerSideEncryption"] = self._settings.s3_server_side_encryption
        async with self._client() as client:
            await client.put_object(
                Bucket=self._settings.s3_raw_bucket,
                Key=key,
                Body=body,
                ContentType=content_type,
                **extra,
            )
        return f"s3://{self._settings.s3_raw_bucket}/{key}"

    async def ping(self) -> bool:
        try:
            async with self._client() as client:
                await client.head_bucket(Bucket=self._settings.s3_raw_bucket)
            return True
        except Exception:
            return False
