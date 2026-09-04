"""Per-tenant matching-weight tuning — the feedback loop.

Every accept/reject is a labelled example: the match's per-signal scores plus a binary
"was this correct". We nudge each signal's weight toward how well, historically, a *high*
value of that signal predicted an accepted match (precision), then renormalise. It is
deliberately simple and explainable — not a black box.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from reconciliation_service.matching import DEFAULT_WEIGHTS
from reconciliation_service.models import MatchFeedback, TenantWeights

_MIN_SAMPLES = 15
_LEARNING_RATE = 0.25
_SIGNAL_HI = 0.7


async def load_weights(session: AsyncSession, tenant_id: str) -> dict[str, float]:
    row = await session.get(TenantWeights, tenant_id)
    return dict(row.weights) if row and row.weights else dict(DEFAULT_WEIGHTS)


async def recompute_weights(session: AsyncSession, tenant_id: str) -> dict[str, float]:
    rows = (
        (await session.execute(select(MatchFeedback).where(MatchFeedback.tenant_id == tenant_id)))
        .scalars()
        .all()
    )
    if len(rows) < _MIN_SAMPLES:
        return await load_weights(session, tenant_id)

    precision: dict[str, float] = {}
    for key in DEFAULT_WEIGHTS:
        hi = [r for r in rows if r.signals.get(key, 0.0) >= _SIGNAL_HI]
        if not hi:
            precision[key] = 0.5
            continue
        correct = sum(1 for r in hi if r.decision == "accepted")
        precision[key] = correct / len(hi)

    tuned = {
        k: max(0.02, DEFAULT_WEIGHTS[k] * (1 - _LEARNING_RATE) + precision[k] * _LEARNING_RATE)
        for k in DEFAULT_WEIGHTS
    }
    total = sum(tuned.values())
    tuned = {k: round(v / total, 4) for k, v in tuned.items()}

    row = await session.get(TenantWeights, tenant_id)
    if row is None:
        row = TenantWeights(tenant_id=tenant_id, weights=tuned, samples=len(rows))
        session.add(row)
    else:
        row.weights = tuned
        row.samples = len(rows)
    return tuned
