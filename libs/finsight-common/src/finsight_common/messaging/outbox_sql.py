"""SQLAlchemy-backed outbox model + store, shared by every DB-owning service."""

from __future__ import annotations

import datetime as dt
import json
import uuid
from typing import Any

from sqlalchemy import JSON, DateTime, String, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from finsight_common.db import Base
from finsight_common.events import EventEnvelope, topic_for

# Generic JSON; SQLAlchemy maps this to JSONB on PostgreSQL and TEXT-backed JSON elsewhere.
_Json = JSON


class OutboxRow(Base):
    __tablename__ = "outbox"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    topic: Mapped[str] = mapped_column(String(255))
    payload: Mapped[dict[str, Any]] = mapped_column(_Json)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: dt.datetime.now(dt.UTC), index=True
    )
    published_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


def enqueue_event(session: AsyncSession, envelope: EventEnvelope[Any]) -> None:
    """Add an event to the outbox within the caller's transaction."""

    session.add(
        OutboxRow(
            tenant_id=envelope.tenant_id,
            topic=topic_for(envelope.data),
            payload=json.loads(envelope.model_dump_json()),
        )
    )


class SqlOutboxStore:
    def __init__(self, sessionmaker: Any) -> None:
        self._sessionmaker = sessionmaker

    async def fetch_unpublished(self, limit: int) -> list[dict[str, Any]]:
        async with self._sessionmaker() as session:
            stmt = (
                select(OutboxRow)
                .where(OutboxRow.published_at.is_(None))
                .order_by(OutboxRow.created_at)
                .limit(limit)
                .with_for_update(skip_locked=True)
            )
            rows = (await session.execute(stmt)).scalars().all()
            return [
                {"id": r.id, "tenant_id": r.tenant_id, "topic": r.topic, "payload": r.payload}
                for r in rows
            ]

    async def mark_published(self, ids: list[str]) -> None:
        async with self._sessionmaker() as session:
            await session.execute(
                update(OutboxRow)
                .where(OutboxRow.id.in_(ids))
                .values(published_at=dt.datetime.now(dt.UTC))
            )
            await session.commit()
