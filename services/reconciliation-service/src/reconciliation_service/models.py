from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import JSON, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from finsight_common.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


class StoredRecord(Base):
    __tablename__ = "records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    type: Mapped[str] = mapped_column(String(32), index=True)
    amount_minor: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3))
    reference: Mapped[str | None] = mapped_column(String(128), nullable=True)
    counterparty: Mapped[str | None] = mapped_column(String(255), nullable=True)
    counterparty_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    occurred_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    ingestion_id: Mapped[str] = mapped_column(String(64), index=True)
    applied_minor: Mapped[int] = mapped_column(
        Integer, default=0
    )  # invoices: amount settled so far
    matched: Mapped[bool] = mapped_column(default=False)
    raw: Mapped[dict] = mapped_column(JSON, default=dict)


class ReconciliationRun(Base):
    __tablename__ = "reconciliation_runs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    scope: Mapped[str] = mapped_column(String(64), default="payment_invoice")
    status: Mapped[str] = mapped_column(String(24), default="completed")
    matched: Mapped[int] = mapped_column(Integer, default=0)
    unmatched: Mapped[int] = mapped_column(Integer, default=0)
    exceptions: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Match(Base):
    __tablename__ = "matches"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    run_id: Mapped[str] = mapped_column(String(64), index=True)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    payment_id: Mapped[str] = mapped_column(String(64))
    invoice_id: Mapped[str] = mapped_column(String(64))
    invoice_ids: Mapped[list] = mapped_column(JSON, default=list)  # split matches
    match_type: Mapped[str] = mapped_column(String(24), default="exact")
    confidence: Mapped[float] = mapped_column(Float)
    amount_applied_minor: Mapped[int] = mapped_column(Integer, default=0)
    residual_minor: Mapped[int] = mapped_column(Integer, default=0)
    explanation: Mapped[str] = mapped_column(Text)
    signals: Mapped[dict] = mapped_column(JSON, default=dict)
    exceptions: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    reviewed_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    reviewed_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    corrected_invoice_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_now)


class UnmatchedItem(Base):
    __tablename__ = "unmatched_items"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    run_id: Mapped[str] = mapped_column(String(64), index=True)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    record_id: Mapped[str] = mapped_column(String(64))
    side: Mapped[str] = mapped_column(String(16))  # "payment" | "invoice"
    reason: Mapped[str] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_now)


class MatchFeedback(Base):
    """A human review decision — the training signal for per-tenant weight tuning."""

    __tablename__ = "match_feedback"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    match_id: Mapped[str] = mapped_column(String(64))
    decision: Mapped[str] = mapped_column(String(16))  # accepted | rejected | corrected
    signals: Mapped[dict] = mapped_column(JSON, default=dict)
    reviewer: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_now)


class TenantWeights(Base):
    __tablename__ = "tenant_weights"

    tenant_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    weights: Mapped[dict] = mapped_column(JSON)
    samples: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_now)
