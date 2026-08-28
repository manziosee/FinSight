"""Heuristic parsers that turn messy inputs into :class:`FinancialRecord` objects.

This is the seed of FinSight's moat: tolerant column detection, currency inference,
sign/direction detection, and reference extraction. Real deployments add an
AI-assisted mapper (see intelligence-service) as a fallback for unknown layouts.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from collections.abc import Iterable
from datetime import datetime

from dateutil import parser as dateparser

from finsight_common.schemas import FinancialRecord, Money, Party, RecordSource, RecordType

_AMOUNT_KEYS = ("amount", "value", "debit", "credit", "total", "montant", "amt")
_DATE_KEYS = ("date", "posted", "timestamp", "time", "transaction_date", "value_date")
_DESC_KEYS = ("description", "narration", "details", "memo", "particulars", "reference", "label")
_REF_KEYS = ("reference", "ref", "invoice", "invoice_no", "invoice_number", "txn_id", "id")
_PARTY_KEYS = ("customer", "counterparty", "payee", "payer", "merchant", "name", "vendor")
_CURRENCY_KEYS = ("currency", "ccy", "cur")
_TYPE_KEYS = ("type", "kind", "transaction_type")

_INVOICE_RE = re.compile(r"\b(?:INV|INVOICE)[-\s#]?(\w+)\b", re.IGNORECASE)


def _first(row: dict[str, str], keys: Iterable[str]) -> str | None:
    lowered = {k.lower().strip(): v for k, v in row.items()}
    for key in keys:
        if key in lowered and str(lowered[key]).strip():
            return str(lowered[key]).strip()
    return None


def _to_minor_units(raw: str) -> int:
    cleaned = re.sub(r"[^\d.\-]", "", raw.replace(",", ""))
    if not cleaned or cleaned in {"-", "."}:
        return 0
    return round(float(cleaned) * 100)


def _parse_date(raw: str | None) -> datetime:
    if not raw:
        return datetime.now().astimezone()
    try:
        return dateparser.parse(raw, dayfirst=True).astimezone()
    except (ValueError, OverflowError):
        return datetime.now().astimezone()


def _classify(description: str | None, ref: str | None, explicit: str | None) -> RecordType:
    haystack = " ".join(filter(None, [description, ref, explicit])).lower()
    if explicit and explicit.lower() in RecordType.__members__:
        return RecordType[explicit.lower()]
    if "invoice" in haystack or _INVOICE_RE.search(haystack or ""):
        return RecordType.invoice if "invoice #" in haystack else RecordType.payment
    if any(w in haystack for w in ("refund", "reversal")):
        return RecordType.refund
    if any(w in haystack for w in ("fee", "charge", "commission")):
        return RecordType.fee
    if any(w in haystack for w in ("pmt", "payment", "pay", "transfer", "momo")):
        return RecordType.payment
    return RecordType.bank_transaction


def _record_id(tenant_id: str, ingestion_id: str, locator: str, payload: str) -> str:
    digest = hashlib.sha256(f"{tenant_id}|{ingestion_id}|{locator}|{payload}".encode()).hexdigest()
    return f"rec_{digest[:24]}"


def _row_to_record(
    row: dict[str, str],
    *,
    tenant_id: str,
    ingestion_id: str,
    source: str,
    s3_key: str,
    locator: str,
) -> FinancialRecord:
    amount_raw = _first(row, _AMOUNT_KEYS) or "0"
    minor = _to_minor_units(amount_raw)
    credit = _first(row, ("credit",))
    debit = _first(row, ("debit",))
    if credit and _to_minor_units(credit):
        direction, minor = "inbound", _to_minor_units(credit)
    elif debit and _to_minor_units(debit):
        direction, minor = "outbound", _to_minor_units(debit)
    else:
        direction = "outbound" if minor < 0 else "inbound"
    minor = abs(minor)

    description = _first(row, _DESC_KEYS)
    ref = _first(row, _REF_KEYS)
    if not ref and description:
        m = _INVOICE_RE.search(description)
        if m:
            ref = f"INV-{m.group(1)}"
    currency = (_first(row, _CURRENCY_KEYS) or "USD")[:3].upper()
    party_name = _first(row, _PARTY_KEYS) or _party_from_description(description)

    try:
        src = RecordSource(source)
    except ValueError:
        src = RecordSource.other

    return FinancialRecord(
        id=_record_id(tenant_id, ingestion_id, locator, json.dumps(row, sort_keys=True)),
        tenant_id=tenant_id,
        type=_classify(description, ref, _first(row, _TYPE_KEYS)),
        source=src,
        amount=Money(minor_units=minor, currency=currency),
        direction=direction,
        occurred_at=_parse_date(_first(row, _DATE_KEYS)),
        description=description,
        reference=ref,
        counterparty=Party(name=party_name, normalized_name=_normalize_name(party_name))
        if party_name
        else None,
        ingestion_id=ingestion_id,
        raw_ref=f"{s3_key}#{locator}",
        confidence=0.9 if (minor and (description or ref)) else 0.6,
        metadata={"raw": row},
    )


_TXN_NOISE_RE = re.compile(
    r"\b(pmt|payment|pay|paid|inv|invoice|ref|txn|trx|transfer|momo|deposit|to|from|for)\b.*",
    re.IGNORECASE,
)


def _party_from_description(description: str | None) -> str | None:
    """Best-effort: the leading entity name in a free-text bank narration."""

    if not description:
        return None
    head = _TXN_NOISE_RE.split(description, maxsplit=1)[0].strip(" -:#")
    head = re.sub(r"\d[\d-]*$", "", head).strip()
    return head or None


def _normalize_name(name: str | None) -> str | None:
    if not name:
        return None
    cleaned = re.sub(r"\b(ltd|limited|inc|llc|plc|co|company|sarl|sa)\b", "", name.lower())
    return re.sub(r"[^a-z0-9 ]", "", cleaned).strip()


def parse_bytes(
    body: bytes, *, content_type: str, tenant_id: str, ingestion_id: str, source: str, s3_key: str
) -> list[FinancialRecord]:
    if content_type == "application/json":
        doc = json.loads(body)
        rows = doc.get("records", doc) if isinstance(doc, dict) else doc
        return [
            _row_to_record(
                r,
                tenant_id=tenant_id,
                ingestion_id=ingestion_id,
                source=source,
                s3_key=s3_key,
                locator=f"json[{i}]",
            )
            for i, r in enumerate(rows)
        ]
    if content_type in ("text/csv", "text/plain"):
        reader = csv.DictReader(io.StringIO(body.decode("utf-8-sig")))
        return [
            _row_to_record(
                {k: (v or "") for k, v in row.items()},
                tenant_id=tenant_id,
                ingestion_id=ingestion_id,
                source=source,
                s3_key=s3_key,
                locator=f"row{i + 2}",
            )
            for i, row in enumerate(reader)
        ]
    # Excel / PDF: scaffolded — return nothing and let the caller flag it.
    return []
