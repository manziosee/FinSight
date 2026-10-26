"""Integration tests: entity resolution against a real PostgreSQL. Requires Docker;
skipped automatically if it's unavailable.
"""

from __future__ import annotations

import datetime as dt

import pytest
from normalization_service.entities import EntityResolver
from normalization_service.models import CanonicalEntity
from sqlalchemy import select

from finsight_common.schemas import FinancialRecord, Money, Party, RecordType

pytestmark = pytest.mark.integration

TENANT = "tenant_it"


def _record(counterparty_name: str, rec_id: str) -> FinancialRecord:
    return FinancialRecord(
        id=rec_id,
        tenant_id=TENANT,
        type=RecordType.payment,
        amount=Money(minor_units=1000, currency="USD"),
        occurred_at=dt.datetime.now(dt.UTC),
        counterparty=Party(name=counterparty_name),
        ingestion_id="ing_1",
        raw_ref="s3://x#1",
    )


@pytest.mark.asyncio
async def test_exact_and_fuzzy_names_resolve_to_one_canonical_entity(db) -> None:
    variants = ["ABC Ltd", "abc ltd.", "ABC LIMITED", "Abc  Ltd"]

    async with db.session() as session:
        resolver = EntityResolver(session, TENANT)
        records = [_record(v, f"rec_{i}") for i, v in enumerate(variants)]
        await resolver.apply(records)

    async with db.session() as session:
        entities = (
            (
                await session.execute(
                    select(CanonicalEntity).where(CanonicalEntity.tenant_id == TENANT)
                )
            )
            .scalars()
            .all()
        )

    assert len(entities) == 1
    entity = entities[0]
    assert entity.seen_count == len(variants)
    assert len(entity.aliases) >= 3  # every distinct spelling recorded
    for rec in records:
        assert rec.counterparty.external_id == entity.id
        assert rec.counterparty.normalized_name == entity.canonical_key


@pytest.mark.asyncio
async def test_distinct_counterparties_stay_separate(db) -> None:
    async with db.session() as session:
        resolver = EntityResolver(session, TENANT)
        await resolver.apply([_record("Kigali Foods", "r1"), _record("Umoja Traders", "r2")])

    async with db.session() as session:
        entities = (
            (
                await session.execute(
                    select(CanonicalEntity).where(CanonicalEntity.tenant_id == TENANT)
                )
            )
            .scalars()
            .all()
        )
    assert len(entities) == 2


@pytest.mark.asyncio
async def test_resolution_persists_across_separate_sessions(db) -> None:
    async with db.session() as session:
        await EntityResolver(session, TENANT).apply([_record("Acme Corp", "r1")])

    # A brand-new resolver/session (simulating the next Kafka message) must reuse the
    # same canonical entity rather than creating a duplicate.
    async with db.session() as session:
        rec = _record("ACME CORP.", "r2")
        await EntityResolver(session, TENANT).apply([rec])

    async with db.session() as session:
        entities = (
            (
                await session.execute(
                    select(CanonicalEntity).where(CanonicalEntity.tenant_id == TENANT)
                )
            )
            .scalars()
            .all()
        )
    assert len(entities) == 1
    assert entities[0].seen_count == 2
