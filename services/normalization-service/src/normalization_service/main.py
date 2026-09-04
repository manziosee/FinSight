from __future__ import annotations

import asyncio
import json

import aioboto3
from fastapi import Depends
from pydantic import BaseModel, Field

from finsight_common.app import create_app
from finsight_common.auth import Principal, require_scopes
from finsight_common.events import (
    AuditRecorded,
    DataIngested,
    EventEnvelope,
    TransactionNormalized,
    topic_for,
)
from finsight_common.logging import get_logger
from finsight_common.messaging import KafkaConnection, KafkaEventBus
from finsight_common.schemas import FinancialRecord
from normalization_service import __version__
from normalization_service.config import get_settings
from normalization_service.entities import EntityResolver
from normalization_service.parsers import parse_document

settings = get_settings()
log = get_logger("normalization-service")
bus = KafkaEventBus(
    KafkaConnection.from_settings(settings),
    client_id="normalization-service",
    group_id="normalization-service",
)
_consumer_task: asyncio.Task | None = None
_s3_session = aioboto3.Session()

# lazy DB (only used for entity resolution + idempotency)
_db: object | None = None


def _database():
    global _db
    if _db is None:
        from finsight_common.db import Database

        _db = Database(settings.normalization_db_dsn)
    return _db


async def _audit_publisher(event: EventEnvelope[AuditRecorded]) -> None:
    await bus.publish(event)


def _s3_client():
    return _s3_session.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key_id,
        aws_secret_access_key=settings.s3_secret_access_key,
    )


async def _fetch(s3_key: str) -> bytes:
    async with _s3_client() as client:
        obj = await client.get_object(Bucket=settings.s3_raw_bucket, Key=s3_key)
        return await obj["Body"].read()


async def _on_data_ingested(body: dict) -> None:
    env = EventEnvelope[DataIngested].model_validate(body)
    ev = env.data
    db = _database()

    from normalization_service.models import ProcessedBatch

    async with db.session() as session:
        if await session.get(ProcessedBatch, ev.ingestion_id):
            log.info("batch.already_processed", ingestion_id=ev.ingestion_id)
            return

    raw = await _fetch(ev.s3_key)
    result = parse_document(
        raw,
        content_type=ev.content_type,
        tenant_id=env.tenant_id,
        ingestion_id=ev.ingestion_id,
        source=ev.source,
        s3_key=ev.s3_key,
    )

    async with db.session() as session:
        await EntityResolver(session, env.tenant_id).apply(result.records)
        session.add(
            ProcessedBatch(
                ingestion_id=ev.ingestion_id,
                tenant_id=env.tenant_id,
                record_count=len(result.records),
            )
        )

    log.info(
        "normalized",
        ingestion_id=ev.ingestion_id,
        records=len(result.records),
        warnings=result.warnings,
        recognised=result.recognised,
    )
    await bus.publish(
        EventEnvelope[TransactionNormalized](
            type="transaction.normalized",
            tenant_id=env.tenant_id,
            producer="normalization-service",
            data=TransactionNormalized(
                ingestion_id=ev.ingestion_id,
                records=result.records,
                warnings=result.warnings,
                source_recognised=result.recognised,
            ),
        )
    )


async def _startup() -> None:
    db = _database()
    if not settings.is_production:
        await db.create_all()
    await bus.start()
    bus.subscribe(topic_for(DataIngested), _on_data_ingested)
    global _consumer_task
    _consumer_task = asyncio.create_task(bus.run_consumers())


async def _shutdown() -> None:
    if _consumer_task:
        _consumer_task.cancel()
    await bus.stop()
    if _db is not None:
        await _db.dispose()  # type: ignore[attr-defined]


app = create_app(
    settings=settings,
    version=__version__,
    title="FinSight Normalization Service",
    description="Turns bank / mobile-money / invoice / spreadsheet / PDF data into the "
    "Universal Financial Schema, with per-tenant entity resolution.",
    ready_checks={"database": lambda: _database().ping()},
    on_startup=_startup,
    on_shutdown=_shutdown,
    audit_publisher=_audit_publisher,
)


class UnderstandRequest(BaseModel):
    transaction: dict = Field(
        examples=[
            {
                "amount": 850000,
                "currency": "RWF",
                "description": "ABC LTD PMT INV 439",
                "date": "2026-08-28",
            }
        ]
    )
    source: str = "api"


class UnderstandResponse(BaseModel):
    record: FinancialRecord
    classification: str
    confidence: float
    warnings: list[str] = Field(default_factory=list)


@app.post("/v1/transactions/understand", response_model=UnderstandResponse, tags=["normalization"])
async def understand(
    body: UnderstandRequest,
    principal: Principal = Depends(require_scopes("transactions:read")),
) -> UnderstandResponse:
    result = parse_document(
        json.dumps({"records": [body.transaction]}).encode(),
        content_type="application/json",
        tenant_id=principal.tenant_id,
        ingestion_id="inline",
        source=body.source,
        s3_key="inline",
    )
    if not result.records:
        from finsight_common.errors import FinSightError

        raise FinSightError("could not parse transaction: " + "; ".join(result.warnings))
    rec = result.records[0]
    async with _database().session() as session:
        await EntityResolver(session, principal.tenant_id).apply([rec])
    return UnderstandResponse(
        record=rec,
        classification=str(rec.type),
        confidence=rec.confidence,
        warnings=result.warnings,
    )
