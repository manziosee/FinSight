"""Evidence gathering — pulls real numbers from reconciliation-service / graph-service
before anything reaches the LLM. The model explains and narrates; it never invents figures.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

import httpx

from finsight_common.logging import get_logger

_log = get_logger(__name__)

_PII_KEYS = {"account_ref", "account_number", "iban", "email", "phone"}


def redact(payload: Any) -> Any:
    """Strip fields that must never reach a third-party LLM provider."""
    if isinstance(payload, dict):
        return {
            k: ("***redacted***" if k.lower() in _PII_KEYS else redact(v))
            for k, v in payload.items()
        }
    if isinstance(payload, list):
        return [redact(v) for v in payload]
    return payload


class EvidenceClient:
    def __init__(self, reconciliation_url: str, graph_url: str, timeout: float = 10.0) -> None:
        self._reconciliation_url = reconciliation_url
        self._graph_url = graph_url
        self._timeout = timeout

    def _headers(self, auth_header: str | None) -> dict[str, str]:
        return {"authorization": auth_header} if auth_header else {}

    async def reconciliation_summary(self, auth_header: str | None) -> dict:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            try:
                resp = await client.get(
                    f"{self._reconciliation_url}/v1/reconciliation/summary",
                    headers=self._headers(auth_header),
                )
                resp.raise_for_status()
                return redact(resp.json())
            except httpx.HTTPError as exc:
                _log.warning("evidence.summary_failed", error=str(exc))
                return {"has_data": False, "error": "reconciliation-service unavailable"}

    async def run_detail(self, run_id: str, auth_header: str | None) -> dict:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            try:
                resp = await client.get(
                    f"{self._reconciliation_url}/v1/reconciliation/{run_id}",
                    headers=self._headers(auth_header),
                )
                resp.raise_for_status()
                return resp.json()
            except httpx.HTTPError as exc:
                _log.warning("evidence.run_fetch_failed", error=str(exc))
                return {}

    async def match_context(self, run_id: str, match_id: str, auth_header: str | None) -> dict:
        data = await self.run_detail(run_id, auth_header)
        if not data:
            return {"found": False, "error": "reconciliation-service unavailable"}
        match = next((m for m in data.get("matches", []) if m["id"] == match_id), None)
        if match is None:
            unmatched = next(
                (u for u in data.get("unmatched_items", []) if u["record_id"] == match_id), None
            )
            if unmatched:
                return {"found": True, "kind": "unmatched", **redact(unmatched)}
            return {"found": False}
        return {"found": True, "kind": "match", **redact(match)}

    async def entity_context(self, entity_id: str, auth_header: str | None) -> dict:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            try:
                resp = await client.get(
                    f"{self._graph_url}/v1/graph/entities/{entity_id}",
                    headers=self._headers(auth_header),
                )
                resp.raise_for_status()
                return redact(resp.json())
            except httpx.HTTPError as exc:
                _log.warning("evidence.graph_fetch_failed", error=str(exc))
                return {}


# --- plain-language snapshot -------------------------------------------------------------
# The model writes for finance people, not engineers: it gets amounts in currency, dates,
# references and customer names — never record IDs, run IDs or minor units.

MAX_RECORDS = 60


def money(minor: int | None, currency: str | None) -> str | None:
    """API amounts are minor units (1/100); render them the way a person reads money."""
    if minor is None:
        return None
    major = minor / 100
    text = f"{major:,.0f}" if major == int(major) else f"{major:,.2f}"
    return f"{text} {currency}" if currency else text


def _date(value: str | None) -> str | None:
    return value[:10] if value else None


def _customer_id(connected: list[dict]) -> str | None:
    return next((c["id"] for c in connected if c.get("kind") == "Customer"), None)


def _name_from_id(customer_id: str) -> str:
    return customer_id.removeprefix("cust_").replace("_", " ").title()


class _Lookup:
    """Fetches graph entities once each and describes them without internal IDs."""

    def __init__(self, client: EvidenceClient, auth_header: str | None) -> None:
        self._client = client
        self._auth = auth_header
        self.entities: dict[str, dict] = {}
        self.customers: dict[str, str] = {}

    async def load(self, record_ids: list[str]) -> None:
        ids = list(dict.fromkeys(i for i in record_ids if i))[:MAX_RECORDS]
        results = await asyncio.gather(*(self._client.entity_context(i, self._auth) for i in ids))
        self.entities = dict(zip(ids, results, strict=True))
        cust_ids = {c for r in results if (c := _customer_id(r.get("connected", []))) is not None}
        cust = await asyncio.gather(*(self._client.entity_context(c, self._auth) for c in cust_ids))
        for cid, data in zip(cust_ids, cust, strict=True):
            self.customers[cid] = (data.get("entity") or {}).get("name") or _name_from_id(cid)

    def describe(self, record_id: str) -> dict:
        data = self.entities.get(record_id) or {}
        e = data.get("entity") or {}
        cid = _customer_id(data.get("connected", []))
        out = {
            "kind": (e.get("kind") or "record").lower(),
            "date": _date(e.get("occurred_at")),
            "amount": money(e.get("amount_minor"), e.get("currency")),
            "counterparty": self.customers.get(cid) if cid else None,
            "reference": e.get("reference"),
            "description": e.get("description"),
        }
        return {k: v for k, v in out.items() if v}

    def currency(self, record_id: str) -> str | None:
        return ((self.entities.get(record_id) or {}).get("entity") or {}).get("currency")

    def minor(self, record_id: str) -> int:
        e = (self.entities.get(record_id) or {}).get("entity") or {}
        return int(e.get("amount_minor") or 0)


def _quality(m: dict) -> str:
    return f"{m.get('match_type')} match, {round(m.get('confidence', 0) * 100)}% confidence"


def _totals(pairs: list[tuple[str | None, int]]) -> list[str]:
    by_cur: dict[str, int] = defaultdict(int)
    for cur, minor in pairs:
        by_cur[cur or ""] += minor
    return [m for cur, minor in sorted(by_cur.items()) if (m := money(minor, cur or None))]


async def financial_snapshot(client: EvidenceClient, auth_header: str | None) -> dict:
    """Everything the assistant may talk about, in words and currency amounts."""
    summary = await client.reconciliation_summary(auth_header)
    if not summary.get("has_data"):
        return {"has_data": False, "note": "No reconciliation has been run yet."}
    run = await client.run_detail(summary["run_id"], auth_header)
    matches = run.get("matches", [])
    unmatched = run.get("unmatched_items", summary.get("unmatched_items", []))

    look = _Lookup(client, auth_header)
    await look.load(
        [m["payment_id"] for m in matches]
        + [i for m in matches for i in m.get("invoice_ids", [])[:1]]
        + [u["record_id"] for u in unmatched]
    )

    matched_rows = []
    received: dict[str, list[tuple[str | None, int]]] = defaultdict(list)
    for m in matches:
        pay = look.describe(m["payment_id"])
        cur = look.currency(m["payment_id"])
        who = pay.get("counterparty", "Unknown customer")
        received[who].append((cur, int(m.get("amount_applied_minor") or 0)))
        matched_rows.append(
            {
                "counterparty": who,
                "payment_date": pay.get("date"),
                "reference": pay.get("reference"),
                "amount_applied": money(m.get("amount_applied_minor"), cur),
                "left_unpaid": money(m.get("residual_minor"), cur),
                "match_quality": _quality(m),
                "review_status": m.get("status"),
                "why_matched": m.get("explanation"),
                "issues": m.get("exceptions") or None,
            }
        )

    unmatched_rows = [
        {**look.describe(u["record_id"]), "side": u.get("side"), "reason": u.get("reason")}
        for u in unmatched
    ]
    open_rows = [
        {
            "counterparty": inv.get("counterparty") or "Unknown customer",
            "invoice_date": _date(inv.get("occurred_at")),
            "invoice_amount": money(inv.get("amount_minor"), inv.get("currency")),
            "still_owed": money(inv.get("open_minor"), inv.get("currency")),
        }
        for inv in summary.get("open_invoices", [])
    ]
    owed: dict[str, list[tuple[str | None, int]]] = defaultdict(list)
    for inv in summary.get("open_invoices", []):
        owed[inv.get("counterparty") or "Unknown customer"].append(
            (inv.get("currency"), int(inv.get("open_minor") or 0))
        )

    return {
        "has_data": True,
        "reconciled_at": summary.get("as_of"),
        "counts": {
            "matched": summary.get("matched", 0),
            "unmatched": summary.get("unmatched", 0),
            "exceptions": summary.get("exceptions", 0),
            "open_invoices": len(open_rows),
        },
        "totals": {
            "received_and_matched": _totals([p for v in received.values() for p in v]),
            "unmatched_payments": _totals(
                [
                    (look.currency(u["record_id"]), look.minor(u["record_id"]))
                    for u in unmatched
                    if u.get("side") == "payment"
                ]
            ),
            "still_owed_on_open_invoices": _totals([p for v in owed.values() for p in v]),
        },
        "received_by_customer": {k: _totals(v) for k, v in sorted(received.items())},
        "owed_by_customer": {k: _totals(v) for k, v in sorted(owed.items())},
        "matched_payments": matched_rows,
        "unmatched_records": unmatched_rows,
        "open_invoices": open_rows,
    }


async def match_snapshot(
    client: EvidenceClient, run_id: str, match_id: str, auth_header: str | None
) -> dict:
    """One match (or unmatched record) described for a person."""
    ctx = await client.match_context(run_id, match_id, auth_header)
    if not ctx.get("found"):
        return ctx
    look = _Lookup(client, auth_header)
    if ctx.get("kind") == "unmatched":
        await look.load([ctx["record_id"]])
        return {
            "found": True,
            "kind": "unmatched",
            "record": look.describe(ctx["record_id"]),
            "side": ctx.get("side"),
            "reason": ctx.get("reason"),
        }
    invoices = ctx.get("invoice_ids", [])
    await look.load([ctx["payment_id"], *invoices])
    cur = look.currency(ctx["payment_id"])
    return {
        "found": True,
        "kind": "match",
        "payment": look.describe(ctx["payment_id"]),
        "invoices": [look.describe(i) for i in invoices],
        "amount_applied": money(ctx.get("amount_applied_minor"), cur),
        "left_unpaid": money(ctx.get("residual_minor"), cur),
        "match_type": ctx.get("match_type"),
        "confidence": f"{round(ctx.get('confidence', 0) * 100)}%",
        "review_status": ctx.get("status"),
        "why_matched": ctx.get("explanation"),
        "issues": ctx.get("exceptions") or None,
    }
