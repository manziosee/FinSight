import datetime as dt

import pytest
from fastapi.testclient import TestClient

from finsight_common.app import create_app
from finsight_common.config import ServiceSettings
from finsight_common.errors import NotFoundError
from finsight_common.events import EventEnvelope, TransactionNormalized, topic_for
from finsight_common.messaging import NullEventBus
from finsight_common.schemas import FinancialRecord, Money, RecordType
from finsight_common.security import FieldCipher, blind_index, generate_api_key


def _settings() -> ServiceSettings:
    return ServiceSettings(service_name="test-svc", env="test")


def test_healthcheck_and_problem_details() -> None:
    app = create_app(settings=_settings(), version="9.9.9")

    @app.get("/boom")
    async def boom() -> None:
        raise NotFoundError("nope")

    client = TestClient(app)
    assert client.get("/health").json() == {"status": "ok", "version": "9.9.9"}

    r = client.get("/boom")
    assert r.status_code == 404
    assert r.headers["content-type"].startswith("application/problem+json")
    assert r.json()["title"] == "Not Found"
    assert r.headers["x-content-type-options"] == "nosniff"


def test_ready_check_reports_degraded() -> None:
    async def failing() -> bool:
        return False

    app = create_app(settings=_settings(), ready_checks={"db": failing})
    r = TestClient(app).get("/ready")
    assert r.status_code == 503
    assert r.json()["checks"] == {"db": False}


def _record() -> FinancialRecord:
    return FinancialRecord(
        id="rec_1",
        tenant_id="t1",
        type=RecordType.payment,
        amount=Money(minor_units=85000000, currency="rwf"),
        occurred_at=dt.datetime(2026, 8, 28, tzinfo=dt.UTC),
        ingestion_id="ing_1",
        raw_ref="s3://raw/x.csv#L2",
    )


def test_financial_schema_normalizes_currency_and_decimal() -> None:
    rec = _record()
    assert rec.amount.currency == "RWF"
    assert rec.amount.decimal == 850000.0


@pytest.mark.asyncio
async def test_null_event_bus_roundtrip_and_topic_mapping() -> None:
    bus = NullEventBus()
    seen: list[dict] = []

    async def handler(body: dict) -> None:
        seen.append(body)

    bus.subscribe(topic_for(TransactionNormalized), handler)

    env = EventEnvelope[TransactionNormalized](
        type="transaction.normalized",
        tenant_id="t1",
        producer="test",
        data=TransactionNormalized(ingestion_id="ing_1", records=[_record()]),
    )
    await bus.publish(env)
    assert bus.published[0].data.ingestion_id == "ing_1"
    assert seen and seen[0]["data"]["ingestion_id"] == "ing_1"


def test_field_cipher_and_blind_index() -> None:
    from cryptography.fernet import Fernet

    cipher = FieldCipher(Fernet.generate_key())
    token = cipher.encrypt("RW93 0000 1234")
    assert cipher.decrypt(token) == "RW93 0000 1234"
    assert blind_index("Acme LTD ", "k") == blind_index("acme ltd", "k")


def test_generate_api_key_returns_hash() -> None:
    raw, hashed = generate_api_key()
    assert raw.startswith("fsk_")
    assert len(hashed) == 64
