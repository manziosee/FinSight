from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import JSON, BigInteger, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from finsight_common.db import Base


class Ingestion(Base):
    __tablename__ = "ingestions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    source: Mapped[str] = mapped_column(String(32))
    content_type: Mapped[str] = mapped_column(String(128))
    s3_key: Mapped[str] = mapped_column(String(512))
    byte_size: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(24), default="received")
    record_count: Mapped[int] = mapped_column(Integer, default=0)
    warnings: Mapped[list[str]] = mapped_column(JSON, default=list)
    error_summary: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: dt.datetime.now(dt.UTC)
    )
    completed_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
