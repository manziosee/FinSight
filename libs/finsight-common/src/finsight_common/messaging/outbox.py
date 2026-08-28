"""Transactional-outbox helper.

Services write domain rows and an ``outbox`` row in the same DB transaction, then a
background relay publishes pending rows to Kafka and marks them sent. This guarantees
at-least-once delivery without 2-phase commit.

The table DDL (create in each owning service's alembic migration)::

    CREATE TABLE outbox (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id    TEXT NOT NULL,
        topic        TEXT NOT NULL,
        payload      JSONB NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        published_at TIMESTAMPTZ
    );
    CREATE INDEX outbox_unpublished ON outbox (created_at) WHERE published_at IS NULL;
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Protocol

from finsight_common.logging import get_logger

_log = get_logger(__name__)


class OutboxStore(Protocol):
    async def fetch_unpublished(self, limit: int) -> list[dict[str, Any]]: ...
    async def mark_published(self, ids: list[str]) -> None: ...


class OutboxRelay:
    def __init__(self, store: OutboxStore, producer: Any, *, poll_seconds: float = 1.0) -> None:
        self._store = store
        self._producer = producer
        self._poll = poll_seconds
        self._stop = asyncio.Event()

    async def run(self) -> None:
        _log.info("outbox.relay.started", poll_seconds=self._poll)
        while not self._stop.is_set():
            try:
                rows = await self._store.fetch_unpublished(limit=100)
                for row in rows:
                    await self._producer.send_and_wait(
                        row["topic"],
                        json.dumps(row["payload"]).encode(),
                        key=row["tenant_id"].encode(),
                    )
                if rows:
                    await self._store.mark_published([r["id"] for r in rows])
                    _log.info("outbox.relay.flushed", count=len(rows))
            except Exception:
                _log.exception("outbox.relay.error")
            await asyncio.wait([asyncio.create_task(self._stop.wait())], timeout=self._poll)

    def stop(self) -> None:
        self._stop.set()
