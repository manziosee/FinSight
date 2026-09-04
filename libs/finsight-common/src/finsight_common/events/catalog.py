"""Versioned event contracts for the FinSight event backbone.

Topic naming: ``finsight.<domain>.<event>.v<major>``. Payloads are JSON-encoded
pydantic models wrapped in :class:`EventEnvelope`. Bump the version suffix on any
breaking change and keep the old consumer running through the migration.
"""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any, Literal, TypeVar

from pydantic import BaseModel, Field

from finsight_common.schemas.financial import FinancialRecord

PayloadT = TypeVar("PayloadT", bound=BaseModel)


class EventEnvelope[PayloadT: BaseModel](BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str
    version: int = 1
    tenant_id: str
    occurred_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.UTC))
    producer: str
    trace_id: str | None = None
    data: PayloadT


# --- payloads ---------------------------------------------------------------


class DataIngested(BaseModel):
    ingestion_id: str
    source: str
    content_type: str
    s3_key: str
    byte_size: int
    record_hint: int | None = None


class TransactionNormalized(BaseModel):
    ingestion_id: str
    records: list[FinancialRecord]
    warnings: list[str] = Field(default_factory=list)
    source_recognised: bool = True


class GraphUpdated(BaseModel):
    ingestion_id: str | None = None
    nodes_upserted: int
    edges_upserted: int
    root_entity_ids: list[str] = Field(default_factory=list)


class ReconciliationCompleted(BaseModel):
    run_id: str
    matched: int
    unmatched: int
    exceptions: int
    scope: str


class AnomalyDetected(BaseModel):
    record_id: str
    rule: str
    severity: Literal["low", "medium", "high", "critical"]
    score: float
    explanation: str


class AuditRecorded(BaseModel):
    actor: str
    action: str
    resource: str
    outcome: Literal["allow", "deny", "error"]
    request_id: str | None = None
    attributes: dict[str, Any] = Field(default_factory=dict)


class MatchReviewed(BaseModel):
    run_id: str
    match_id: str
    decision: Literal["accepted", "rejected", "corrected"]
    reviewer: str
    signals: dict[str, float] = Field(default_factory=dict)
    corrected_invoice_id: str | None = None


# --- topic registry -------------------------------------------------------


EVENT_TOPICS: dict[type[BaseModel], str] = {
    DataIngested: "finsight.ingestion.data-ingested.v1",
    TransactionNormalized: "finsight.normalization.transaction-normalized.v1",
    GraphUpdated: "finsight.graph.graph-updated.v1",
    ReconciliationCompleted: "finsight.reconciliation.completed.v1",
    AnomalyDetected: "finsight.anomaly.detected.v1",
    AuditRecorded: "finsight.audit.recorded.v1",
    MatchReviewed: "finsight.reconciliation.match-reviewed.v1",
}


def topic_for(payload: BaseModel | type[BaseModel]) -> str:
    key = payload if isinstance(payload, type) else type(payload)
    try:
        return EVENT_TOPICS[key]
    except KeyError as exc:  # pragma: no cover - programmer error
        raise KeyError(f"no topic registered for {key.__name__}") from exc
