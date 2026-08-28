from __future__ import annotations

import asyncio
import datetime as dt
import uuid

from fastapi import Depends, UploadFile
from pydantic import BaseModel, Field

from finsight_common.app import create_app
from finsight_common.auth import Principal, require_scopes
from finsight_common.db import Database
from finsight_common.errors import FinSightError
from finsight_common.events import DataIngested, EventEnvelope
from finsight_common.messaging import (
    KafkaConnection,
    KafkaEventBus,
    OutboxRelay,
    SqlOutboxStore,
    enqueue_event,
)
from ingestion_service import __version__
from ingestion_service.config import get_settings
from ingestion_service.models import Ingestion
from ingestion_service.storage import ObjectStore

settings = get_settings()
db = Database(settings.ingestion_db_dsn)
store = ObjectStore(settings)
bus = KafkaEventBus(
    KafkaConnection.from_settings(settings),
    client_id="ingestion-service",
    group_id="ingestion-service",
)
_relay_task: asyncio.Task | None = None


async def _startup() -> None:
    if not settings.is_production:
        await db.create_all()
    await store.ensure_bucket()
    await bus.start()
    global _relay_task
    relay = OutboxRelay(SqlOutboxStore(db.sessionmaker), bus.producer)
    _relay_task = asyncio.create_task(relay.run())


async def _shutdown() -> None:
    if _relay_task:
        _relay_task.cancel()
    await bus.stop()
    await db.dispose()


app = create_app(
    settings=settings,
    version=__version__,
    title="FinSight Ingestion Service",
    description="Accepts raw financial data of any shape and lands it in object storage.",
    ready_checks={"database": db.ping, "object_store": store.ping},
    on_startup=_startup,
    on_shutdown=_shutdown,
)


class IngestJson(BaseModel):
    source: str = Field(default="api", examples=["bank", "mobile_money", "erp"])
    records: list[dict] = Field(min_length=1)


class IngestionAccepted(BaseModel):
    ingestion_id: str
    status: str
    s3_uri: str


async def _persist(
    principal: Principal, *, source: str, content_type: str, body: bytes
) -> IngestionAccepted:
    if len(body) > settings.max_upload_bytes:
        raise FinSightError("payload exceeds max upload size")

    ingestion_id = str(uuid.uuid4())
    ts = dt.datetime.now(dt.UTC).strftime("%Y/%m/%d")
    key = f"{principal.tenant_id}/{ts}/{ingestion_id}"
    uri = await store.put(key, body, content_type)

    async with db.session() as session:
        session.add(
            Ingestion(
                id=ingestion_id,
                tenant_id=principal.tenant_id,
                source=source,
                content_type=content_type,
                s3_key=key,
                byte_size=len(body),
            )
        )
        enqueue_event(
            session,
            EventEnvelope[DataIngested](
                type="data.ingested",
                tenant_id=principal.tenant_id,
                producer="ingestion-service",
                data=DataIngested(
                    ingestion_id=ingestion_id,
                    source=source,
                    content_type=content_type,
                    s3_key=key,
                    byte_size=len(body),
                ),
            ),
        )
    return IngestionAccepted(ingestion_id=ingestion_id, status="received", s3_uri=uri)


@app.post("/v1/data/ingest", response_model=IngestionAccepted, status_code=202, tags=["ingestion"])
async def ingest_json(
    body: IngestJson,
    principal: Principal = Depends(require_scopes("data:write")),
) -> IngestionAccepted:
    import json

    payload = json.dumps({"source": body.source, "records": body.records}).encode()
    return await _persist(
        principal, source=body.source, content_type="application/json", body=payload
    )


@app.post("/v1/data/upload", response_model=IngestionAccepted, status_code=202, tags=["ingestion"])
async def upload(
    file: UploadFile,
    source: str = "spreadsheet",
    principal: Principal = Depends(require_scopes("data:write")),
) -> IngestionAccepted:
    content_type = file.content_type or "application/octet-stream"
    if content_type not in settings.allowed_content_types:
        raise FinSightError(f"unsupported content type: {content_type}")
    return await _persist(
        principal, source=source, content_type=content_type, body=await file.read()
    )
