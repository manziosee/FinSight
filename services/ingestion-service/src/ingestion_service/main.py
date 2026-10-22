from __future__ import annotations

import asyncio
import datetime as dt
import uuid
from typing import Literal

from fastapi import Depends, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select

from finsight_common.app import create_app
from finsight_common.auth import Principal, require_scopes
from finsight_common.db import Database
from finsight_common.errors import FinSightError, NotFoundError
from finsight_common.events import DataIngested, EventEnvelope, TransactionNormalized, topic_for
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
_consumer_task: asyncio.Task | None = None


async def _startup() -> None:
    if not settings.is_production:
        await db.create_all()
    await store.ensure_bucket()
    await bus.start()
    bus.subscribe(topic_for(TransactionNormalized), _on_normalized)
    global _relay_task, _consumer_task
    relay = OutboxRelay(SqlOutboxStore(db.sessionmaker), bus.producer)
    _relay_task = asyncio.create_task(relay.run())
    _consumer_task = asyncio.create_task(bus.run_consumers())


async def _shutdown() -> None:
    if _relay_task:
        _relay_task.cancel()
    if _consumer_task:
        _consumer_task.cancel()
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
    status: Literal["received"] = Field(description="The batch has been durably accepted.")
    s3_uri: str
    status_url: str = Field(description="Relative API path to poll for processing results.")


class IngestionStatusResponse(BaseModel):
    ingestion_id: str
    status: Literal["received", "completed", "failed"] = Field(
        description="Current asynchronous processing state."
    )
    source: str
    record_count: int
    warnings: list[str] = Field(description="Non-fatal parsing and normalization warnings.")
    error_summary: str | None = None
    created_at: dt.datetime
    completed_at: dt.datetime | None = None


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
    return IngestionAccepted(
        ingestion_id=ingestion_id,
        status="received",
        s3_uri=uri,
        status_url=f"/v1/data/ingestions/{ingestion_id}",
    )


async def _on_normalized(body: dict) -> None:
    env = EventEnvelope[TransactionNormalized].model_validate(body)
    async with db.session() as session:
        stmt = select(Ingestion).where(
            Ingestion.id == env.data.ingestion_id,
            Ingestion.tenant_id == env.tenant_id,
        )
        ingestion = (await session.execute(stmt)).scalar_one_or_none()
        if ingestion is None:
            raise NotFoundError(f"ingestion {env.data.ingestion_id} not found")

        ingestion.record_count = len(env.data.records)
        ingestion.warnings = env.data.warnings
        ingestion.completed_at = env.occurred_at
        ingestion.status = "completed" if env.data.source_recognised else "failed"
        ingestion.error_summary = (
            "; ".join(env.data.warnings)[:1000] if not env.data.source_recognised else None
        )


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


@app.get(
    "/v1/data/ingestions/{ingestion_id}",
    response_model=IngestionStatusResponse,
    tags=["ingestion"],
)
async def get_ingestion(
    ingestion_id: str,
    principal: Principal = Depends(require_scopes("data:write")),
) -> IngestionStatusResponse:
    """Get the status and normalization result for an ingestion owned by this tenant."""
    async with db.session() as session:
        stmt = select(Ingestion).where(
            Ingestion.id == ingestion_id,
            Ingestion.tenant_id == principal.tenant_id,
        )
        ingestion = (await session.execute(stmt)).scalar_one_or_none()
        if ingestion is None:
            raise NotFoundError(f"ingestion {ingestion_id} not found")

    return IngestionStatusResponse(
        ingestion_id=ingestion.id,
        status=ingestion.status,
        source=ingestion.source,
        record_count=ingestion.record_count,
        warnings=ingestion.warnings or [],
        error_summary=ingestion.error_summary,
        created_at=ingestion.created_at,
        completed_at=ingestion.completed_at,
    )
