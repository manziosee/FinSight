from __future__ import annotations

import asyncio
import datetime as dt

from fastapi import Depends
from pydantic import BaseModel, Field
from sqlalchemy import select

from finsight_common.app import create_app
from finsight_common.auth import Principal, require_scopes
from finsight_common.db import Database
from finsight_common.errors import NotFoundError
from finsight_common.events import (
    EventEnvelope,
    ReconciliationCompleted,
    TransactionNormalized,
    topic_for,
)
from finsight_common.logging import get_logger
from finsight_common.messaging import KafkaConnection, KafkaEventBus
from finsight_common.schemas import RecordType
from reconciliation_service import __version__
from reconciliation_service.config import get_settings
from reconciliation_service.matching import Candidate, best_matches, score
from reconciliation_service.models import Match, ReconciliationRun, StoredRecord

settings = get_settings()
log = get_logger("reconciliation-service")
db = Database(settings.reconciliation_db_dsn)
bus = KafkaEventBus(
    KafkaConnection.from_settings(settings),
    client_id="reconciliation-service",
    group_id="reconciliation-service",
)
_consumer_task: asyncio.Task | None = None
_EPOCH = dt.datetime(1970, 1, 1, tzinfo=dt.UTC)


def _to_candidate(r: StoredRecord) -> Candidate:
    return Candidate(
        id=r.id,
        amount_minor=r.amount_minor,
        currency=r.currency,
        reference=r.reference,
        counterparty=r.counterparty,
        occurred_at_days=(r.occurred_at - _EPOCH).total_seconds() / 86400,
    )


async def _on_normalized(body: dict) -> None:
    env = EventEnvelope[TransactionNormalized].model_validate(body)
    async with db.session() as session:
        for rec in env.data.records:
            if await session.get(StoredRecord, rec.id):
                continue
            session.add(
                StoredRecord(
                    id=rec.id,
                    tenant_id=rec.tenant_id,
                    type=str(rec.type),
                    amount_minor=rec.amount.minor_units,
                    currency=rec.amount.currency,
                    reference=rec.reference,
                    counterparty=(rec.counterparty.normalized_name if rec.counterparty else None),
                    occurred_at=rec.occurred_at,
                    ingestion_id=rec.ingestion_id,
                    raw=rec.metadata.get("raw", {}),
                )
            )
    log.info("records.stored", ingestion_id=env.data.ingestion_id, count=len(env.data.records))


async def _startup() -> None:
    if not settings.is_production:
        await db.create_all()
    await bus.start()
    bus.subscribe(topic_for(TransactionNormalized), _on_normalized)
    global _consumer_task
    _consumer_task = asyncio.create_task(bus.run_consumers())


async def _shutdown() -> None:
    if _consumer_task:
        _consumer_task.cancel()
    await bus.stop()
    await db.dispose()


app = create_app(
    settings=settings,
    version=__version__,
    title="FinSight Reconciliation Service",
    description="Matches payments to invoices (and bank/ledger) with a confidence and explanation.",
    ready_checks={"database": db.ping},
    on_startup=_startup,
    on_shutdown=_shutdown,
)


class RunRequest(BaseModel):
    scope: str = Field(default="payment_invoice")
    ingestion_id: str | None = None


class MatchOut(BaseModel):
    payment_id: str
    invoice_id: str
    confidence: float
    explanation: str


class RunResult(BaseModel):
    run_id: str
    scope: str
    matched: int
    unmatched: int
    matches: list[MatchOut]


class PairRequest(BaseModel):
    payment: dict
    invoice: dict


@app.post("/v1/reconciliation/run", response_model=RunResult, tags=["reconciliation"])
async def run(
    body: RunRequest,
    principal: Principal = Depends(require_scopes("reconciliation:run")),
) -> RunResult:
    async with db.session() as session:
        base = select(StoredRecord).where(StoredRecord.tenant_id == principal.tenant_id)
        if body.ingestion_id:
            base = base.where(StoredRecord.ingestion_id == body.ingestion_id)
        rows = list((await session.execute(base)).scalars().all())

        payments = [_to_candidate(r) for r in rows if r.type == RecordType.payment.value]
        invoices = [_to_candidate(r) for r in rows if r.type == RecordType.invoice.value]
        pairs = best_matches(payments, invoices, threshold=settings.min_confidence)

        run_row = ReconciliationRun(
            tenant_id=principal.tenant_id,
            scope=body.scope,
            matched=len(pairs),
            unmatched=len(payments) - len(pairs),
        )
        session.add(run_row)
        await session.flush()

        matched_ids = {pid for pid, _, _ in pairs} | {iid for _, iid, _ in pairs}
        for r in rows:
            if r.id in matched_ids:
                r.matched = True

        out = []
        for pid, iid, ms in pairs:
            session.add(
                Match(
                    run_id=run_row.id,
                    tenant_id=principal.tenant_id,
                    payment_id=pid,
                    invoice_id=iid,
                    confidence=ms.confidence,
                    explanation=ms.explanation,
                )
            )
            out.append(
                MatchOut(
                    payment_id=pid,
                    invoice_id=iid,
                    confidence=ms.confidence,
                    explanation=ms.explanation,
                )
            )
        run_id = run_row.id
        unmatched = run_row.unmatched

    await bus.publish(
        EventEnvelope[ReconciliationCompleted](
            type="reconciliation.completed",
            tenant_id=principal.tenant_id,
            producer="reconciliation-service",
            data=ReconciliationCompleted(
                run_id=run_id,
                matched=len(out),
                unmatched=unmatched,
                exceptions=0,
                scope=body.scope,
            ),
        )
    )
    return RunResult(
        run_id=run_id, scope=body.scope, matched=len(out), unmatched=unmatched, matches=out
    )


@app.get("/v1/reconciliation/{run_id}", response_model=RunResult, tags=["reconciliation"])
async def get_run(
    run_id: str,
    principal: Principal = Depends(require_scopes("reconciliation:read")),
) -> RunResult:
    async with db.session() as session:
        run_row = await session.get(ReconciliationRun, run_id)
        if not run_row or run_row.tenant_id != principal.tenant_id:
            raise NotFoundError(f"reconciliation run {run_id} not found")
        matches = (
            (await session.execute(select(Match).where(Match.run_id == run_id))).scalars().all()
        )
    return RunResult(
        run_id=run_id,
        scope=run_row.scope,
        matched=run_row.matched,
        unmatched=run_row.unmatched,
        matches=[
            MatchOut(
                payment_id=m.payment_id,
                invoice_id=m.invoice_id,
                confidence=m.confidence,
                explanation=m.explanation,
            )
            for m in matches
        ],
    )


@app.post("/v1/payments/match", response_model=MatchOut, tags=["reconciliation"])
async def match_pair(
    body: PairRequest,
    principal: Principal = Depends(require_scopes("payments:match")),
) -> MatchOut:
    def _cand(d: dict) -> Candidate:
        return Candidate(
            id=str(d.get("id", "candidate")),
            amount_minor=int(d.get("amount_minor", round(float(d.get("amount", 0)) * 100))),
            currency=str(d.get("currency", "USD")).upper(),
            reference=d.get("reference"),
            counterparty=d.get("counterparty"),
            occurred_at_days=0.0,
        )

    p, inv = _cand(body.payment), _cand(body.invoice)
    ms = score(p, inv)
    return MatchOut(
        payment_id=p.id, invoice_id=inv.id, confidence=ms.confidence, explanation=ms.explanation
    )
