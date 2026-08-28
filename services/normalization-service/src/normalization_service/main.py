from __future__ import annotations

import asyncio

import aioboto3
from fastapi import Depends
from pydantic import BaseModel, Field

from finsight_common.app import create_app
from finsight_common.auth import Principal, require_scopes
from finsight_common.events import (
    DataIngested,
    EventEnvelope,
    TransactionNormalized,
    topic_for,
)
from finsight_common.logging import get_logger
from finsight_common.messaging import KafkaEventBus
from finsight_common.schemas import FinancialRecord
from normalization_service import __version__
from normalization_service.config import get_settings
from normalization_service.parsers import parse_bytes

settings = get_settings()
log = get_logger("normalization-service")
bus = KafkaEventBus(
    settings.kafka_bootstrap_servers,
    client_id="normalization-service",
    group_id="normalization-service",
)
_consumer_task: asyncio.Task | None = None
_s3_session = aioboto3.Session()


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
    raw = await _fetch(ev.s3_key)
    records = parse_bytes(
        raw,
        content_type=ev.content_type,
        tenant_id=env.tenant_id,
        ingestion_id=ev.ingestion_id,
        source=ev.source,
        s3_key=ev.s3_key,
    )
    log.info("normalized", ingestion_id=ev.ingestion_id, records=len(records))
    await bus.publish(
        EventEnvelope[TransactionNormalized](
            type="transaction.normalized",
            tenant_id=env.tenant_id,
            producer="normalization-service",
            data=TransactionNormalized(ingestion_id=ev.ingestion_id, records=records),
        )
    )


async def _startup() -> None:
    await bus.start()
    bus.subscribe(topic_for(DataIngested), _on_data_ingested)
    global _consumer_task
    _consumer_task = asyncio.create_task(bus.run_consumers())


async def _shutdown() -> None:
    if _consumer_task:
        _consumer_task.cancel()
    await bus.stop()


app = create_app(
    settings=settings,
    version=__version__,
    title="FinSight Normalization Service",
    description="Turns bank / mobile-money / invoice / spreadsheet data into the "
    "Universal Financial Schema.",
    on_startup=_startup,
    on_shutdown=_shutdown,
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


@app.post("/v1/transactions/understand", response_model=UnderstandResponse, tags=["normalization"])
async def understand(
    body: UnderstandRequest,
    principal: Principal = Depends(require_scopes("transactions:read")),
) -> UnderstandResponse:
    import json

    records = parse_bytes(
        json.dumps({"records": [body.transaction]}).encode(),
        content_type="application/json",
        tenant_id=principal.tenant_id,
        ingestion_id="inline",
        source=body.source,
        s3_key="inline",
    )
    rec = records[0]
    return UnderstandResponse(
        record=rec,
        classification=str(rec.type),
        confidence=rec.confidence,
    )
