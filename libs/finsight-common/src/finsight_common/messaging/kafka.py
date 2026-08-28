"""Thin async Kafka wrapper around aiokafka with a no-op implementation for tests."""

from __future__ import annotations

import asyncio
import json
from collections.abc import Awaitable, Callable
from typing import Any, Protocol

from finsight_common.events import EventEnvelope, topic_for
from finsight_common.logging import get_logger

_log = get_logger(__name__)

EventHandler = Callable[[dict[str, Any]], Awaitable[None]]


class EventBus(Protocol):
    async def start(self) -> None: ...
    async def stop(self) -> None: ...
    async def publish(self, envelope: EventEnvelope[Any], *, key: str | None = None) -> None: ...
    def subscribe(self, topic: str, handler: EventHandler) -> None: ...
    async def run_consumers(self) -> None: ...


class KafkaEventBus:
    def __init__(self, bootstrap_servers: str, *, client_id: str, group_id: str) -> None:
        self._bootstrap = bootstrap_servers
        self._client_id = client_id
        self._group_id = group_id
        self._producer: Any = None
        self._handlers: dict[str, list[EventHandler]] = {}

    async def start(self) -> None:
        from aiokafka import AIOKafkaProducer

        self._producer = AIOKafkaProducer(
            bootstrap_servers=self._bootstrap,
            client_id=self._client_id,
            enable_idempotence=True,
            acks="all",
        )
        await self._producer.start()
        _log.info("kafka.producer.started", bootstrap=self._bootstrap)

    @property
    def producer(self) -> Any:
        return self._producer

    async def stop(self) -> None:
        if self._producer:
            await self._producer.stop()

    async def publish(self, envelope: EventEnvelope[Any], *, key: str | None = None) -> None:
        topic = topic_for(envelope.data)
        payload = envelope.model_dump_json().encode()
        await self._producer.send_and_wait(topic, payload, key=(key or envelope.tenant_id).encode())
        _log.info("event.published", topic=topic, event_id=envelope.id, type=envelope.type)

    def subscribe(self, topic: str, handler: EventHandler) -> None:
        self._handlers.setdefault(topic, []).append(handler)

    async def run_consumers(self) -> None:
        from aiokafka import AIOKafkaConsumer

        if not self._handlers:
            return
        consumer = AIOKafkaConsumer(
            *self._handlers.keys(),
            bootstrap_servers=self._bootstrap,
            group_id=self._group_id,
            enable_auto_commit=False,
            auto_offset_reset="earliest",
        )
        await consumer.start()
        _log.info("kafka.consumer.started", topics=list(self._handlers))
        try:
            async for msg in consumer:
                body = json.loads(msg.value)
                for handler in self._handlers.get(msg.topic, []):
                    try:
                        await handler(body)
                    except Exception:
                        _log.exception("event.handler_failed", topic=msg.topic)
                await consumer.commit()
        finally:
            await consumer.stop()


class NullEventBus:
    """In-memory bus: publish records into a list, dispatch to handlers synchronously."""

    def __init__(self) -> None:
        self.published: list[EventEnvelope[Any]] = []
        self._handlers: dict[str, list[EventHandler]] = {}

    async def start(self) -> None:
        return None

    async def stop(self) -> None:
        return None

    async def publish(self, envelope: EventEnvelope[Any], *, key: str | None = None) -> None:
        self.published.append(envelope)
        topic = topic_for(envelope.data)
        for handler in self._handlers.get(topic, []):
            await handler(json.loads(envelope.model_dump_json()))

    def subscribe(self, topic: str, handler: EventHandler) -> None:
        self._handlers.setdefault(topic, []).append(handler)

    async def run_consumers(self) -> None:
        await asyncio.sleep(0)
