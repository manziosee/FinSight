from __future__ import annotations

import json

from intelligence_service.evidence import financial_snapshot, match_snapshot, money

ENTITIES = {
    "rec_pay": {
        "entity": {
            "kind": "Payment",
            "occurred_at": "2026-11-08T00:00:00+00:00",
            "amount_minor": 120000000,
            "currency": "RWF",
            "reference": "INV-440",
            "description": "KIGALI FOODS PAYMENT INV-440",
        },
        "connected": [{"id": "cust_kigalifoods", "kind": "Customer"}],
    },
    "rec_inv": {
        "entity": {
            "kind": "Invoice",
            "occurred_at": "2026-10-08T00:00:00+00:00",
            "amount_minor": 120000000,
            "currency": "RWF",
            "reference": "INV-440",
        },
        "connected": [{"id": "cust_kigalifoods", "kind": "Customer"}],
    },
    "rec_unk": {
        "entity": {
            "kind": "Payment",
            "amount_minor": 9000000,
            "currency": "RWF",
            "description": "UNKNOWN DEPOSIT",
        },
        "connected": [{"id": "cust_unknown", "kind": "Customer"}],
    },
    "cust_kigalifoods": {"entity": {"kind": "Customer", "name": "Kigali Foods"}},
    "cust_unknown": {"entity": {"kind": "Customer"}},
}

MATCH = {
    "id": "m1",
    "payment_id": "rec_pay",
    "invoice_ids": ["rec_inv"],
    "match_type": "exact",
    "confidence": 0.9,
    "amount_applied_minor": 120000000,
    "residual_minor": 0,
    "explanation": "Matched on exact amount match.",
    "exceptions": [],
    "status": "pending",
}
UNMATCHED = {"record_id": "rec_unk", "side": "payment", "reason": "no open invoice"}


class FakeClient:
    async def reconciliation_summary(self, auth_header):
        return {
            "has_data": True,
            "run_id": "run-uuid",
            "as_of": "2026-11-25T14:21:00+00:00",
            "matched": 1,
            "unmatched": 1,
            "exceptions": 0,
            "unmatched_items": [UNMATCHED],
            "open_invoices": [
                {
                    "id": "rec_open",
                    "counterparty": "Volcano Logistics",
                    "amount_minor": 50000000,
                    "open_minor": 25000000,
                    "currency": "RWF",
                    "occurred_at": "2026-11-01T00:00:00+00:00",
                }
            ],
        }

    async def run_detail(self, run_id, auth_header):
        return {"matches": [MATCH], "unmatched_items": [UNMATCHED]}

    async def entity_context(self, entity_id, auth_header):
        return ENTITIES.get(entity_id, {})

    async def match_context(self, run_id, match_id, auth_header):
        return {"found": True, "kind": "match", **MATCH}


def test_money_reads_like_money() -> None:
    assert money(120000000, "RWF") == "1,200,000 RWF"
    assert money(12345, "USD") == "123.45 USD"
    assert money(None, "RWF") is None


async def test_snapshot_uses_names_and_amounts_not_ids() -> None:
    snap = await financial_snapshot(FakeClient(), None)  # type: ignore[arg-type]
    text = json.dumps(snap)
    for internal in ("rec_", "run-uuid", "cust_", "minor"):
        assert internal not in text
    assert snap["received_by_customer"] == {"Kigali Foods": ["1,200,000 RWF"]}
    assert snap["owed_by_customer"] == {"Volcano Logistics": ["250,000 RWF"]}
    assert snap["totals"]["unmatched_payments"] == ["90,000 RWF"]
    assert snap["unmatched_records"][0]["counterparty"] == "Unknown"
    assert snap["matched_payments"][0]["match_quality"] == "exact match, 90% confidence"


async def test_match_snapshot_describes_both_sides() -> None:
    snap = await match_snapshot(FakeClient(), "run-uuid", "m1", None)  # type: ignore[arg-type]
    assert "rec_" not in json.dumps(snap)
    assert snap["payment"]["counterparty"] == "Kigali Foods"
    assert snap["invoices"][0]["reference"] == "INV-440"
    assert snap["amount_applied"] == "1,200,000 RWF"
