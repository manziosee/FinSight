"""Normalization owns an idempotency ledger and the per-tenant canonical entity table."""

from __future__ import annotations

import datetime as dt

from sqlalchemy import JSON, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from finsight_common.db import Base


def _now() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


class ProcessedBatch(Base):
    __tablename__ = "processed_batches"

    ingestion_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    record_count: Mapped[int] = mapped_column(Integer, default=0)
    processed_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_now)


class CanonicalEntity(Base):
    """A deduplicated customer / vendor. `aliases` holds every raw spelling seen."""

    __tablename__ = "canonical_entities"
    __table_args__ = (UniqueConstraint("tenant_id", "canonical_key", name="uq_entity_key"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    canonical_key: Mapped[str] = mapped_column(String(255), index=True)
    display_name: Mapped[str] = mapped_column(String(255))
    kind: Mapped[str] = mapped_column(String(32), default="counterparty")
    aliases: Mapped[list] = mapped_column(JSON, default=list)
    seen_count: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_now)
