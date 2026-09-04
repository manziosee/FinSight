"""Thin async Kafka wrapper around aiokafka with a no-op implementation for tests."""

from __future__ import annotations

import asyncio
import json
import ssl
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Protocol

from finsight_common.events import EventEnvelope, topic_for
from finsight_common.logging import get_logger

if TYPE_CHECKING:
    from finsight_common.config import ServiceSettings

_log = get_logger(__name__)

EventHandler = Callable[[dict[str, Any]], Awaitable[None]]


@dataclass(slots=True)
class KafkaConnection:
    """Connection params. PLAINTEXT locally / on MSK-in-VPC; SASL_SSL for Upstash & friends."""

    bootstrap_servers: str
    security_protocol: str = "PLAINTEXT"
    sasl_mechanism: str | None = None
    sasl_username: str | None = None
    sasl_password: str | None = None
    enable_idempotence: bool = True

    @classmethod
    def from_settings(cls, settings: ServiceSettings) -> KafkaConnection:
        return cls(
            bootstrap_servers=settings.kafka_bootstrap_servers,
            security_protocol=settings.kafka_security_protocol,
            sasl_mechanism=settings.kafka_sasl_mechanism,
            sasl_username=settings.kafka_sasl_username,
            sasl_password=settings.kafka_sasl_password,
            enable_idempotence=settings.kafka_enable_idempotence,
        )

    def client_kwargs(self) -> dict[str, Any]:
        kw: dict[str, Any] = {
            "bootstrap_servers": self.bootstrap_servers,
            "security_protocol": self.security_protocol,
        }
        if self.security_protocol.endswith("SSL"):
            kw["ssl_context"] = ssl.create_default_context()
        if self.sasl_mechanism:
            kw["sasl_mechanism"] = self.sasl_mechanism
            kw["sasl_plain_username"] = self.sasl_username
            kw["sasl_plain_password"] = self.sasl_password
        return kw


class EventBus(Protocol):
    async def start(self) -> None: ...
    async def stop(self) -> None: ...
    async def publish(self, envelope: EventEnvelope[Any], *, key: str | None = None) -> None: ...
    def subscribe(self, topic: str, handler: EventHandler) -> None: ...
    async def run_consumers(self) -> None: ...


class KafkaEventBus:
    def __init__(
        self,
        connection: str | KafkaConnection,
        *,
        client_id: str,
        group_id: str,
    ) -> None:
        self._conn = (
            connection
            if isinstance(connection, KafkaConnection)
            else KafkaConnection(bootstrap_servers=connection)
        )
        self._client_id = client_id
        self._group_id = group_id
        self._producer: Any = None
        self._handlers: dict[str, list[EventHandler]] = {}

    async def start(self) -> None:
        from aiokafka import AIOKafkaProducer

        self._producer = AIOKafkaProducer(
            client_id=self._client_id,
            enable_idempotence=self._conn.enable_idempotence,
            acks="all",
            **self._conn.client_kwargs(),
        )
        await self._producer.start()
        _log.info(
            "kafka.producer.started",
            bootstrap=self._conn.bootstrap_servers,
            security=self._conn.security_protocol,
        )

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

    async def run_consumers(self, *, max_retries: int = 3, retry_base_delay: float = 0.5) -> None:
        """Consume subscribed topics. A message that keeps failing after ``max_retries``
        in-process attempts (exponential backoff) is published to ``<topic>.dlq`` and the
        offset is committed so the partition is not blocked."""
        from aiokafka import AIOKafkaConsumer

        if not self._handlers:
            return
        if self._producer is None:
            await self.start()
        consumer = AIOKafkaConsumer(
            *self._handlers.keys(),
            group_id=self._group_id,
            client_id=self._client_id,
            enable_auto_commit=False,
            auto_offset_reset="earliest",
            **self._conn.client_kwargs(),
        )
        await consumer.start()
        _log.info("kafka.consumer.started", topics=list(self._handlers))
        try:
            async for msg in consumer:
                await self._dispatch(msg, max_retries, retry_base_delay)
                await consumer.commit()
        finally:
            await consumer.stop()

    async def _dispatch(self, msg: Any, max_retries: int, base_delay: float) -> None:
        body = json.loads(msg.value)
        for handler in self._handlers.get(msg.topic, []):
            for attempt in range(1, max_retries + 1):
                try:
                    await handler(body)
                    break
                except Exception:
                    if attempt == max_retries:
                        _log.exception(
                            "event.handler_dead_lettered", topic=msg.topic, attempts=attempt
                        )
                        await self._to_dlq(msg, body)
                    else:
                        _log.warning("event.handler_retry", topic=msg.topic, attempt=attempt)
                        await asyncio.sleep(base_delay * 2 ** (attempt - 1))

    async def _to_dlq(self, msg: Any, body: dict[str, Any]) -> None:
        dlq_topic = f"{msg.topic}.dlq"
        envelope = {
            "original_topic": msg.topic,
            "partition": msg.partition,
            "offset": msg.offset,
            "key": msg.key.decode() if msg.key else None,
            "payload": body,
        }
        try:
            await self._producer.send_and_wait(
                dlq_topic, json.dumps(envelope).encode(), key=msg.key
            )
        except Exception:
            _log.exception("event.dlq_publish_failed", topic=dlq_topic)


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
