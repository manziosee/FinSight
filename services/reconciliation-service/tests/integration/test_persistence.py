"""Integration tests: the matching engine and weight tuning against a real PostgreSQL —
catches what mocked unit tests can't (column types, JSON columns, constraints, real
transactions). Requires Docker; skipped automatically if it's unavailable.
"""

from __future__ import annotations

import datetime as dt

import pytest
from sqlalchemy import select

from reconciliation_service.matching import Candidate, reconcile
from reconciliation_service.models import Match, MatchFeedback, StoredRecord, TenantWeights
from reconciliation_service.weights import DEFAULT_WEIGHTS, load_weights, recompute_weights

pytestmark = pytest.mark.integration

TENANT = "tenant_it"


async def _seed_records(db) -> None:
    now = dt.datetime.now(dt.UTC)
    async with db.session() as session:
        session.add_all(
            [
                StoredRecord(
                    id="pay_1", tenant_id=TENANT, type="payment", amount_minor=85_000_00,
                    currency="RWF", reference="INV-439", counterparty="abc",
                    occurred_at=now, ingestion_id="ing_1",
                ),
                StoredRecord(
                    id="inv_1", tenant_id=TENANT, type="invoice", amount_minor=85_000_00,
                    currency="RWF", reference="INV-439", counterparty="abc",
                    occurred_at=now, ingestion_id="ing_1",
                ),
            ]
        )


@pytest.mark.asyncio
async def test_matching_persists_correctly_against_real_postgres(db) -> None:
    await _seed_records(db)

    async with db.session() as session:
        rows = (
            await session.execute(select(StoredRecord).where(StoredRecord.tenant_id == TENANT))
        ).scalars().all()

    payments = [
        Candidate(id=r.id, amount_minor=r.amount_minor, currency=r.currency,
                  reference=r.reference, counterparty=r.counterparty)
        for r in rows if r.type == "payment"
    ]
    invoices = [
        Candidate(id=r.id, amount_minor=r.amount_minor, currency=r.currency,
                  reference=r.reference, counterparty=r.counterparty)
        for r in rows if r.type == "invoice"
    ]
    result = reconcile(payments, invoices, threshold=0.6)
    assert len(result.matches) == 1
    pid, iids, ms = result.matches[0]

    async with db.session() as session:
        session.add(
            Match(
                run_id="run_1", tenant_id=TENANT, payment_id=pid, invoice_id=iids[0],
                invoice_ids=iids, match_type=ms.match_type, confidence=ms.confidence,
                amount_applied_minor=ms.amount_applied_minor, explanation=ms.explanation,
                signals=ms.signals, status="pending",
            )
        )

    async with db.session() as session:
        stored = (
            await session.execute(select(Match).where(Match.tenant_id == TENANT))
        ).scalar_one()
        assert stored.match_type == "exact"
        assert stored.signals["amount"] == 1.0
        assert stored.status == "pending"


@pytest.mark.asyncio
async def test_weights_default_then_learn_from_feedback(db) -> None:
    async with db.session() as session:
        weights = await load_weights(session, TENANT)
    assert weights == DEFAULT_WEIGHTS

    # Below the minimum-sample threshold: recompute is a no-op (still defaults).
    async with db.session() as session:
        session.add(
            MatchFeedback(
                tenant_id=TENANT, match_id="m1", decision="accepted",
                signals={"amount": 1.0, "reference": 1.0, "counterparty": 1.0, "recency": 1.0},
                reviewer="tester",
            )
        )
        unchanged = await recompute_weights(session, TENANT)
    assert unchanged == DEFAULT_WEIGHTS

    # Cross the sample threshold: `reference` is high on every row and always correct
    # (precision 1.0); `amount` is high on a *different* set of rows but only correct
    # half the time (precision ~0.5). Despite starting with a lower default weight
    # (0.30 vs 0.45), a perfectly-precise signal should overtake a coin-flip one.
    async with db.session() as session:
        for i in range(11):
            session.add(
                MatchFeedback(
                    tenant_id=TENANT, match_id=f"ref{i}", decision="accepted",
                    signals={"amount": 0.2, "reference": 0.9, "counterparty": 0.1, "recency": 0.1},
                    reviewer="tester",
                )
            )
        for i in range(10):
            session.add(
                MatchFeedback(
                    tenant_id=TENANT, match_id=f"amt{i}",
                    decision="accepted" if i % 2 == 0 else "rejected",
                    signals={"amount": 0.9, "reference": 0.2, "counterparty": 0.1, "recency": 0.1},
                    reviewer="tester",
                )
            )
        tuned = await recompute_weights(session, TENANT)

    assert abs(sum(tuned.values()) - 1.0) < 1e-6
    assert tuned["reference"] > tuned["amount"], (
        "a perfectly-precise signal (reference) should overtake a 50%-precise one "
        f"(amount) after learning, even from a lower default weight: {tuned}"
    )

    async with db.session() as session:
        row = await session.get(TenantWeights, TENANT)
        assert row is not None
        assert row.samples == 22
        persisted = await load_weights(session, TENANT)
    assert persisted == tuned
