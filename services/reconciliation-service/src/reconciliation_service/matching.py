"""The matching engine: score a candidate payment/invoice pair and explain it."""

from __future__ import annotations

from dataclasses import dataclass

from rapidfuzz import fuzz

# Weighted signals — tune these as feedback accrues (this is the learning surface).
_WEIGHTS = {
    "amount": 0.45,
    "reference": 0.30,
    "counterparty": 0.15,
    "recency": 0.10,
}


@dataclass(slots=True)
class Candidate:
    id: str
    amount_minor: int
    currency: str
    reference: str | None
    counterparty: str | None
    occurred_at_days: float  # days since epoch, for proximity


@dataclass(slots=True)
class MatchScore:
    confidence: float
    explanation: str


def score(payment: Candidate, invoice: Candidate) -> MatchScore:
    reasons: list[str] = []
    signals: dict[str, float] = {}

    if payment.currency == invoice.currency and payment.amount_minor == invoice.amount_minor:
        signals["amount"] = 1.0
        reasons.append("exact amount + currency match")
    elif payment.currency == invoice.currency and invoice.amount_minor:
        ratio = min(payment.amount_minor, invoice.amount_minor) / max(
            payment.amount_minor, invoice.amount_minor
        )
        signals["amount"] = ratio if ratio > 0.95 else 0.0
        if ratio > 0.95:
            reasons.append(f"amount within {(1 - ratio) * 100:.1f}%")

    if payment.reference and invoice.reference:
        r = fuzz.token_set_ratio(payment.reference.lower(), invoice.reference.lower()) / 100
        signals["reference"] = r
        if r > 0.8:
            reasons.append(
                f"reference similarity {r:.0%} ({payment.reference} ~ {invoice.reference})"
            )

    if payment.counterparty and invoice.counterparty:
        c = fuzz.token_set_ratio(payment.counterparty, invoice.counterparty) / 100
        signals["counterparty"] = c
        if c > 0.8:
            reasons.append(f"counterparty match {c:.0%}")

    day_gap = abs(payment.occurred_at_days - invoice.occurred_at_days)
    signals["recency"] = max(0.0, 1.0 - day_gap / 60)
    if day_gap <= 45:
        reasons.append(f"dated {day_gap:.0f} days apart")

    confidence = sum(_WEIGHTS[k] * signals.get(k, 0.0) for k in _WEIGHTS)
    if not reasons:
        reasons.append("no strong signals")
    return MatchScore(
        confidence=round(confidence, 4),
        explanation="Payment matched to invoice based on " + ", ".join(reasons) + ".",
    )


def best_matches(
    payments: list[Candidate], invoices: list[Candidate], *, threshold: float
) -> list[tuple[str, str, MatchScore]]:
    """Greedy 1:1 assignment, highest-confidence pairs first."""

    scored: list[tuple[float, str, str, MatchScore]] = []
    for p in payments:
        for inv in invoices:
            ms = score(p, inv)
            if ms.confidence >= threshold:
                scored.append((ms.confidence, p.id, inv.id, ms))
    scored.sort(reverse=True, key=lambda t: t[0])

    used_p: set[str] = set()
    used_i: set[str] = set()
    out: list[tuple[str, str, MatchScore]] = []
    for _conf, pid, iid, ms in scored:
        if pid in used_p or iid in used_i:
            continue
        used_p.add(pid)
        used_i.add(iid)
        out.append((pid, iid, ms))
    return out
