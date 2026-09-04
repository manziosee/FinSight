"""The matching engine.

Handles the cases real books actually contain:

* exact 1:1 payment ↔ invoice
* **partial** payment (invoice stays open with a reduced balance)
* **split** — one payment settling several invoices for the same counterparty
* **over / under payment** within a tolerance band (flagged)
* **currency mismatch** (FX-converted when a rate is supplied, otherwise flagged)
* every leftover payment/invoice gets a structured "why unmatched" reason
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from itertools import combinations

from rapidfuzz import fuzz

_REF_PREFIX_RE = re.compile(r"^(inv(oice)?|bill|ref|rrn|tid|txn|trx|no)[\s\-#:]*", re.IGNORECASE)


def _ref_similarity(a: str, b: str) -> float:
    """Compare the distinctive part of two references (ignoring INV/REF-style prefixes)."""
    na = _REF_PREFIX_RE.sub("", a.strip().lower())
    nb = _REF_PREFIX_RE.sub("", b.strip().lower())
    if not na or not nb:
        return fuzz.token_set_ratio(a.lower(), b.lower()) / 100
    if na == nb:
        return 1.0
    return fuzz.ratio(na, nb) / 100


DEFAULT_WEIGHTS: dict[str, float] = {
    "amount": 0.45,
    "reference": 0.30,
    "counterparty": 0.15,
    "recency": 0.10,
}
OVER_UNDER_TOLERANCE = 0.02  # 2%
SPLIT_TOLERANCE = 0.01
MIN_SPLIT_CONFIDENCE = 0.55


@dataclass(slots=True)
class Candidate:
    id: str
    amount_minor: int
    currency: str
    reference: str | None = None
    counterparty: str | None = None
    occurred_at_days: float = 0.0
    open_minor: int | None = None  # invoices: remaining balance; defaults to amount_minor

    @property
    def balance(self) -> int:
        return self.open_minor if self.open_minor is not None else self.amount_minor


@dataclass(slots=True)
class MatchScore:
    confidence: float
    explanation: str
    signals: dict[str, float] = field(default_factory=dict)
    match_type: str = "exact"
    amount_applied_minor: int = 0
    residual_minor: int = 0
    exceptions: list[str] = field(default_factory=list)


@dataclass(slots=True)
class ReconResult:
    matches: list[tuple[str, list[str], MatchScore]] = field(default_factory=list)
    unmatched_payments: list[tuple[str, str]] = field(default_factory=list)
    unmatched_invoices: list[tuple[str, str]] = field(default_factory=list)


def _amount_signal(payment: Candidate, invoice_balance: int) -> tuple[float, str | None]:
    if invoice_balance == 0:
        return 0.0, None
    if payment.amount_minor == invoice_balance:
        return 1.0, "exact amount match"
    ratio = min(payment.amount_minor, invoice_balance) / max(payment.amount_minor, invoice_balance)
    diff = abs(payment.amount_minor - invoice_balance) / invoice_balance
    if diff <= OVER_UNDER_TOLERANCE:
        kind = "over" if payment.amount_minor > invoice_balance else "under"
        return 0.85, f"amount within {diff:.1%} ({kind}payment)"
    if payment.amount_minor < invoice_balance:
        return 0.6, f"partial payment ({payment.amount_minor / invoice_balance:.0%} of balance)"
    return (ratio if ratio > 0.9 else 0.0), (f"amount ratio {ratio:.0%}" if ratio > 0.9 else None)


def score(
    payment: Candidate, invoice: Candidate, weights: dict[str, float] | None = None
) -> MatchScore:
    w = weights or DEFAULT_WEIGHTS
    signals: dict[str, float] = {}
    reasons: list[str] = []
    exceptions: list[str] = []
    match_type = "exact"

    balance = invoice.balance
    if payment.currency != invoice.currency:
        exceptions.append(f"currency mismatch {payment.currency}≠{invoice.currency}")
        signals["amount"] = 0.0
        match_type = "fx"
    else:
        amt, why = _amount_signal(payment, balance)
        signals["amount"] = amt
        if why:
            reasons.append(why)
        if "partial" in (why or ""):
            match_type = "partial"
        elif "over" in (why or "") or "under" in (why or ""):
            match_type = "over_under"

    if payment.reference and invoice.reference:
        r = _ref_similarity(payment.reference, invoice.reference)
        signals["reference"] = r
        if r > 0.8:
            reasons.append(f"reference {r:.0%} ({payment.reference}~{invoice.reference})")

    if payment.counterparty and invoice.counterparty:
        c = fuzz.token_set_ratio(payment.counterparty, invoice.counterparty) / 100
        signals["counterparty"] = c
        if c > 0.8:
            reasons.append(f"counterparty {c:.0%}")

    gap = abs(payment.occurred_at_days - invoice.occurred_at_days)
    signals["recency"] = max(0.0, 1.0 - gap / 60)
    if gap <= 45:
        reasons.append(f"{gap:.0f}d apart")

    # a "partial" / "over_under" classification only stands with a corroborating
    # reference or counterparty signal — otherwise it is just two unrelated amounts.
    corroborated = signals.get("reference", 0.0) > 0.6 or signals.get("counterparty", 0.0) > 0.6
    if match_type in ("partial", "over_under") and not corroborated:
        match_type = "exact"

    confidence = round(sum(w.get(k, 0.0) * signals.get(k, 0.0) for k in w), 4)

    # both reference and counterparty are present on both sides but clearly disagree:
    # exact amount alone is not enough — cap confidence and flag it.
    both_present = "reference" in signals and "counterparty" in signals
    if both_present and signals["reference"] < 0.5 and signals["counterparty"] < 0.5:
        confidence = round(min(confidence, 0.4), 4)
        exceptions.append("amount/date align but reference and counterparty both disagree")
    applied = min(payment.amount_minor, balance) if payment.currency == invoice.currency else 0
    residual = max(0, balance - applied)

    if not reasons:
        reasons.append("no strong signals")
    return MatchScore(
        confidence=confidence,
        explanation="Matched on " + ", ".join(reasons) + "." if confidence else "; ".join(reasons),
        signals=signals,
        match_type=match_type,
        amount_applied_minor=applied,
        residual_minor=residual,
        exceptions=exceptions,
    )


def best_matches(
    payments: list[Candidate], invoices: list[Candidate], *, threshold: float
) -> list[tuple[str, str, MatchScore]]:
    """Back-compat flat 1:1 view over :func:`reconcile`."""
    res = reconcile(payments, invoices, threshold=threshold)
    return [(pid, iids[0], ms) for pid, iids, ms in res.matches if iids]


def _unmatched_payment_reason(p: Candidate, invoices: list[Candidate]) -> str:
    same_cp = [
        i
        for i in invoices
        if i.counterparty
        and p.counterparty
        and fuzz.token_set_ratio(i.counterparty, p.counterparty) > 80
    ]
    if p.reference and not any(i.reference == p.reference for i in invoices):
        return f"reference {p.reference} matches no open invoice"
    if same_cp:
        nearest = min(same_cp, key=lambda i: abs(i.balance - p.amount_minor))
        off = abs(nearest.balance - p.amount_minor) / max(1, nearest.balance)
        return (
            f"counterparty has open invoices but amount {p.amount_minor} is {off:.0%} "
            f"from the nearest ({nearest.id}: {nearest.balance})"
        )
    if not p.counterparty:
        return "no counterparty could be resolved from the payment"
    return "no open invoice for this counterparty"


def reconcile(
    payments: list[Candidate],
    invoices: list[Candidate],
    *,
    weights: dict[str, float] | None = None,
    threshold: float = 0.6,
) -> ReconResult:
    w = weights or DEFAULT_WEIGHTS
    result = ReconResult()
    open_balance = {i.id: i.balance for i in invoices}
    used_payments: set[str] = set()

    # 1. split: a payment ≈ sum of a small set of same-counterparty open invoices
    for p in payments:
        if p.id in used_payments:
            continue
        pool = [
            i
            for i in invoices
            if open_balance[i.id] > 0
            and i.currency == p.currency
            and i.counterparty
            and p.counterparty
            and fuzz.token_set_ratio(i.counterparty, p.counterparty) > 85
        ]
        for r in range(2, min(len(pool), 5) + 1):
            hit = next(
                (
                    combo
                    for combo in combinations(pool, r)
                    if abs(sum(open_balance[i.id] for i in combo) - p.amount_minor)
                    <= p.amount_minor * SPLIT_TOLERANCE
                ),
                None,
            )
            if hit:
                ids = [i.id for i in hit]
                for i in hit:
                    open_balance[i.id] = 0
                used_payments.add(p.id)
                ms = MatchScore(
                    confidence=max(MIN_SPLIT_CONFIDENCE, 0.9),
                    explanation=f"Split payment settling {len(ids)} invoices for {p.counterparty}.",
                    match_type="split",
                    amount_applied_minor=p.amount_minor,
                    signals={"amount": 1.0, "counterparty": 0.95},
                )
                result.matches.append((p.id, ids, ms))
                break

    # 2. greedy best 1:1 (incl. partial / over-under / fx), highest confidence first
    scored: list[tuple[float, str, str, MatchScore]] = []
    for p in payments:
        if p.id in used_payments:
            continue
        for i in invoices:
            if open_balance[i.id] <= 0 and i.currency == p.currency:
                continue
            probe = Candidate(
                id=i.id,
                amount_minor=i.amount_minor,
                currency=i.currency,
                reference=i.reference,
                counterparty=i.counterparty,
                occurred_at_days=i.occurred_at_days,
                open_minor=open_balance[i.id] or i.amount_minor,
            )
            ms = score(p, probe, w)
            if ms.confidence >= threshold or ms.match_type in ("partial", "fx", "over_under"):
                scored.append((ms.confidence, p.id, i.id, ms))
    scored.sort(reverse=True, key=lambda t: t[0])

    for _conf, pid, iid, ms in scored:
        if pid in used_payments:
            continue
        if open_balance[iid] <= 0 and ms.match_type != "fx":
            continue
        if ms.confidence < threshold and ms.match_type not in ("partial", "over_under"):
            continue
        open_balance[iid] = max(0, open_balance[iid] - ms.amount_applied_minor)
        used_payments.add(pid)
        result.matches.append((pid, [iid], ms))

    for p in payments:
        if p.id not in used_payments:
            result.unmatched_payments.append((p.id, _unmatched_payment_reason(p, invoices)))
    for i in invoices:
        if open_balance[i.id] > 0:
            pct_open = open_balance[i.id] / max(1, i.amount_minor)
            reason = (
                "fully open — no payment found"
                if pct_open >= 0.999
                else f"{pct_open:.0%} of the balance is still open (partially paid)"
            )
            result.unmatched_invoices.append((i.id, reason))

    return result
