from __future__ import annotations

import asyncio
import datetime as dt

from fastapi import Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select

from finsight_common.app import create_app
from finsight_common.auth import Principal, require_scopes
from finsight_common.db import Database
from finsight_common.errors import ConflictError, NotFoundError
from finsight_common.events import (
    AuditRecorded,
    EventEnvelope,
    MatchReviewed,
    ReconciliationCompleted,
    TransactionNormalized,
    topic_for,
)
from finsight_common.logging import get_logger
from finsight_common.messaging import KafkaConnection, KafkaEventBus
from finsight_common.schemas import RecordType
from reconciliation_service import __version__
from reconciliation_service.config import get_settings
from reconciliation_service.matching import Candidate, reconcile, score
from reconciliation_service.models import (
    Match,
    MatchFeedback,
    ReconciliationRun,
    StoredRecord,
    UnmatchedItem,
)
from reconciliation_service.weights import load_weights, recompute_weights

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


async def _audit_publisher(event: EventEnvelope[AuditRecorded]) -> None:
    await bus.publish(event)


def _to_candidate(r: StoredRecord, *, as_invoice: bool = False) -> Candidate:
    return Candidate(
        id=r.id,
        amount_minor=r.amount_minor,
        currency=r.currency,
        reference=r.reference,
        counterparty=r.counterparty,
        occurred_at_days=(r.occurred_at - _EPOCH).total_seconds() / 86400,
        open_minor=(r.amount_minor - (r.applied_minor or 0)) if as_invoice else None,
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
                    counterparty_id=(rec.counterparty.external_id if rec.counterparty else None),
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
    description="Matches payments to invoices (partial / split / over-under / FX), explains "
    "every leftover, and learns per-tenant from human review.",
    ready_checks={"database": db.ping},
    on_startup=_startup,
    on_shutdown=_shutdown,
    audit_publisher=_audit_publisher,
)


# --- schemas --------------------------------------------------------------


class RunRequest(BaseModel):
    scope: str = Field(default="payment_invoice")
    ingestion_id: str | None = None


class MatchOut(BaseModel):
    id: str
    payment_id: str
    invoice_ids: list[str]
    match_type: str
    confidence: float
    amount_applied_minor: int
    residual_minor: int
    explanation: str
    exceptions: list[str] = Field(default_factory=list)
    status: str


class UnmatchedOut(BaseModel):
    record_id: str
    side: str
    reason: str


class RunResult(BaseModel):
    run_id: str
    scope: str
    matched: int
    unmatched: int
    exceptions: int
    matches: list[MatchOut]
    unmatched_items: list[UnmatchedOut] = Field(default_factory=list)


class ReviewRequest(BaseModel):
    decision: str = Field(pattern="^(accept|reject|correct)$")
    corrected_invoice_id: str | None = None
    note: str | None = None


class PairRequest(BaseModel):
    payment: dict
    invoice: dict


def _match_out(m: Match) -> MatchOut:
    return MatchOut(
        id=m.id,
        payment_id=m.payment_id,
        invoice_ids=m.invoice_ids or [m.invoice_id],
        match_type=m.match_type,
        confidence=m.confidence,
        amount_applied_minor=m.amount_applied_minor,
        residual_minor=m.residual_minor,
        explanation=m.explanation,
        exceptions=m.exceptions or [],
        status=m.status,
    )


# --- endpoints -----------------------------------------------------------


@app.post("/v1/reconciliation/run", response_model=RunResult, tags=["reconciliation"])
async def run(
    body: RunRequest,
    principal: Principal = Depends(require_scopes("reconciliation:run")),
) -> RunResult:
    async with db.session() as session:
        stmt = select(StoredRecord).where(StoredRecord.tenant_id == principal.tenant_id)
        if body.ingestion_id:
            stmt = stmt.where(StoredRecord.ingestion_id == body.ingestion_id)
        rows = list((await session.execute(stmt)).scalars().all())
        weights = await load_weights(session, principal.tenant_id)

        # a run recomputes from scratch — prior runs' applied balances are not carried over
        for r in rows:
            r.applied_minor = 0
            r.matched = False

        payments = [_to_candidate(r) for r in rows if r.type == RecordType.payment.value]
        invoices = [
            _to_candidate(r, as_invoice=True) for r in rows if r.type == RecordType.invoice.value
        ]
        res = reconcile(payments, invoices, weights=weights, threshold=settings.min_confidence)

        exc_count = sum(len(ms.exceptions) for _, _, ms in res.matches)
        run_row = ReconciliationRun(
            tenant_id=principal.tenant_id,
            scope=body.scope,
            matched=len(res.matches),
            unmatched=len(res.unmatched_payments) + len(res.unmatched_invoices),
            exceptions=exc_count,
        )
        session.add(run_row)
        await session.flush()

        rec_by_id = {r.id: r for r in rows}
        out_matches: list[Match] = []
        for pid, iids, ms in res.matches:
            for iid in iids:
                if iid in rec_by_id:
                    rec_by_id[iid].applied_minor = (rec_by_id[iid].applied_minor or 0) + (
                        ms.amount_applied_minor // max(1, len(iids))
                    )
                    rec_by_id[iid].matched = ms.residual_minor == 0
            if pid in rec_by_id:
                rec_by_id[pid].matched = True
            m = Match(
                run_id=run_row.id,
                tenant_id=principal.tenant_id,
                payment_id=pid,
                invoice_id=iids[0],
                invoice_ids=iids,
                match_type=ms.match_type,
                confidence=ms.confidence,
                amount_applied_minor=ms.amount_applied_minor,
                residual_minor=ms.residual_minor,
                explanation=ms.explanation,
                signals=ms.signals,
                exceptions=ms.exceptions,
                status="auto" if ms.confidence >= 0.95 and not ms.exceptions else "pending",
            )
            session.add(m)
            out_matches.append(m)

        for rid, reason in res.unmatched_payments:
            session.add(
                UnmatchedItem(
                    run_id=run_row.id,
                    tenant_id=principal.tenant_id,
                    record_id=rid,
                    side="payment",
                    reason=reason,
                )
            )
        for rid, reason in res.unmatched_invoices:
            session.add(
                UnmatchedItem(
                    run_id=run_row.id,
                    tenant_id=principal.tenant_id,
                    record_id=rid,
                    side="invoice",
                    reason=reason,
                )
            )
        await session.flush()

        run_id = run_row.id
        result = RunResult(
            run_id=run_id,
            scope=body.scope,
            matched=len(res.matches),
            unmatched=run_row.unmatched,
            exceptions=exc_count,
            matches=[_match_out(m) for m in out_matches],
            unmatched_items=[
                UnmatchedOut(record_id=r, side="payment", reason=x)
                for r, x in res.unmatched_payments
            ]
            + [
                UnmatchedOut(record_id=r, side="invoice", reason=x)
                for r, x in res.unmatched_invoices
            ],
        )

    await bus.publish(
        EventEnvelope[ReconciliationCompleted](
            type="reconciliation.completed",
            tenant_id=principal.tenant_id,
            producer="reconciliation-service",
            data=ReconciliationCompleted(
                run_id=run_id,
                matched=result.matched,
                unmatched=result.unmatched,
                exceptions=exc_count,
                scope=body.scope,
            ),
        )
    )
    return result


@app.get(
    "/v1/reconciliation/{run_id}/matches", response_model=list[MatchOut], tags=["reconciliation"]
)
async def review_queue(
    run_id: str,
    status: str = Query(default="pending"),
    principal: Principal = Depends(require_scopes("reconciliation:read")),
) -> list[MatchOut]:
    async with db.session() as session:
        stmt = select(Match).where(Match.run_id == run_id, Match.tenant_id == principal.tenant_id)
        if status != "all":
            stmt = stmt.where(Match.status == status)
        rows = (await session.execute(stmt)).scalars().all()
    return [_match_out(m) for m in rows]


@app.post(
    "/v1/reconciliation/matches/{match_id}/review",
    response_model=MatchOut,
    tags=["reconciliation"],
)
async def review_match(
    match_id: str,
    body: ReviewRequest,
    principal: Principal = Depends(require_scopes("reconciliation:run")),
) -> MatchOut:
    decision_map = {"accept": "accepted", "reject": "rejected", "correct": "corrected"}
    async with db.session() as session:
        m = await session.get(Match, match_id)
        if not m or m.tenant_id != principal.tenant_id:
            raise NotFoundError(f"match {match_id} not found")
        if m.status in ("accepted", "rejected", "corrected"):
            raise ConflictError(f"match already reviewed ({m.status})")

        m.status = decision_map[body.decision]
        m.reviewed_by = principal.subject
        m.reviewed_at = dt.datetime.now(dt.UTC)
        if body.decision == "correct":
            m.corrected_invoice_id = body.corrected_invoice_id

        session.add(
            MatchFeedback(
                tenant_id=principal.tenant_id,
                match_id=m.id,
                decision=m.status,
                signals=m.signals or {},
                reviewer=principal.subject,
            )
        )
        await session.flush()
        tuned = await recompute_weights(session, principal.tenant_id)
        out = _match_out(m)

    await bus.publish(
        EventEnvelope[MatchReviewed](
            type="reconciliation.match_reviewed",
            tenant_id=principal.tenant_id,
            producer="reconciliation-service",
            data=MatchReviewed(
                run_id=m.run_id,
                match_id=m.id,
                decision=m.status,
                reviewer=principal.subject,
                signals=m.signals or {},
                corrected_invoice_id=m.corrected_invoice_id,
            ),
        )
    )
    log.info("match.reviewed", match_id=match_id, decision=m.status, weights=tuned)
    return out


@app.get("/v1/reconciliation/weights", tags=["reconciliation"])
async def get_weights(
    principal: Principal = Depends(require_scopes("reconciliation:read")),
) -> dict:
    async with db.session() as session:
        return {
            "tenant_id": principal.tenant_id,
            "weights": await load_weights(session, principal.tenant_id),
        }


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
        unmatched = (
            (await session.execute(select(UnmatchedItem).where(UnmatchedItem.run_id == run_id)))
            .scalars()
            .all()
        )
    return RunResult(
        run_id=run_id,
        scope=run_row.scope,
        matched=run_row.matched,
        unmatched=run_row.unmatched,
        exceptions=run_row.exceptions,
        matches=[_match_out(m) for m in matches],
        unmatched_items=[
            UnmatchedOut(record_id=u.record_id, side=u.side, reason=u.reason) for u in unmatched
        ],
    )


@app.post("/v1/payments/match", response_model=MatchOut, tags=["reconciliation"])
async def match_pair(
    body: PairRequest,
    principal: Principal = Depends(require_scopes("payments:match")),
) -> MatchOut:
    def _cand(d: dict, as_invoice: bool = False) -> Candidate:
        amt = int(d.get("amount_minor", round(float(d.get("amount", 0)) * 100)))
        return Candidate(
            id=str(d.get("id", "candidate")),
            amount_minor=amt,
            currency=str(d.get("currency", "USD")).upper(),
            reference=d.get("reference"),
            counterparty=d.get("counterparty"),
            open_minor=amt if as_invoice else None,
        )

    p, inv = _cand(body.payment), _cand(body.invoice, as_invoice=True)
    ms = score(p, inv)
    return MatchOut(
        id="ephemeral",
        payment_id=p.id,
        invoice_ids=[inv.id],
        match_type=ms.match_type,
        confidence=ms.confidence,
        amount_applied_minor=ms.amount_applied_minor,
        residual_minor=ms.residual_minor,
        explanation=ms.explanation,
        exceptions=ms.exceptions,
        status="ephemeral",
    )
