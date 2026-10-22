"""Heuristic parsers that turn messy inputs into :class:`FinancialRecord` objects.

This is the seed of FinSight's moat: tolerant column detection, currency inference,
sign/direction detection, reference extraction, and multi-format support
(CSV / JSON / Excel / PDF statements). An AI-assisted column mapper
(:mod:`normalization_service.mapper`) is the fallback for layouts the heuristics miss.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from dateutil import parser as dateparser

from finsight_common.schemas import FinancialRecord, Money, Party, RecordSource, RecordType

_AMOUNT_KEYS = ("amount", "value", "total", "montant", "amt", "gross", "net", "amount_paid")
_DEBIT_KEYS = ("debit", "withdrawal", "paid out", "paid_out", "dr", "outflow", "money out")
_CREDIT_KEYS = ("credit", "deposit", "paid in", "paid_in", "cr", "inflow", "money in")
_DATE_KEYS = (
    "date",
    "posted",
    "posting date",
    "timestamp",
    "time",
    "transaction_date",
    "value_date",
    "value date",
    "trans date",
    "txn date",
)
_DESC_KEYS = (
    "description",
    "narration",
    "details",
    "detail",
    "memo",
    "particulars",
    "label",
    "transaction details",
    "remarks",
    "note",
    "purpose",
)
_REF_KEYS = (
    "reference",
    "ref",
    "ref no",
    "invoice",
    "invoice_no",
    "invoice no",
    "invoice_number",
    "invoice number",
    "txn_id",
    "transaction id",
    "id",
    "receipt",
)
_PARTY_KEYS = (
    "customer",
    "counterparty",
    "payee",
    "payer",
    "merchant",
    "name",
    "vendor",
    "beneficiary",
    "sender",
    "client",
    "supplier",
    "account name",
)
_CURRENCY_KEYS = ("currency", "ccy", "cur", "curr")
_TYPE_KEYS = ("type", "kind", "transaction_type", "transaction type", "tran type")
_BALANCE_KEYS = ("balance", "running balance", "closing balance", "bal")

_INVOICE_RE = re.compile(r"\b(?:INV|INVOICE|BILL)[-\s#:]?\s?([A-Z0-9]{2,})\b", re.IGNORECASE)
_REF_IN_TEXT_RE = re.compile(r"\b(?:REF|RRN|TID|TXN|TRX)[-\s#:]?\s?([A-Z0-9]{4,})\b", re.IGNORECASE)
# common statement line: DATE  DESCRIPTION ...  AMOUNT  [BALANCE]
_PDF_LINE_RE = re.compile(
    r"^(?P<date>\d{1,2}[/-][A-Za-z0-9]{2,}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\s+"
    r"(?P<desc>.+?)\s+"
    r"(?P<amount>-?[\d,]+\.\d{2})(?:\s+(?P<balance>-?[\d,]+\.\d{2}))?\s*$"
)


@dataclass(slots=True)
class ParseResult:
    records: list[FinancialRecord] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    recognised: bool = True

    def __iter__(self):  # keeps `for r in parse_bytes(...)` working
        return iter(self.records)

    def __len__(self) -> int:
        return len(self.records)

    def __eq__(self, other: object) -> bool:  # tests compare against []
        if isinstance(other, list):
            return self.records == other
        return NotImplemented

    def __getitem__(self, i: int) -> FinancialRecord:
        return self.records[i]


def _first(row: dict[str, str], keys: Iterable[str]) -> str | None:
    lowered = {k.lower().strip(): v for k, v in row.items()}
    keys = list(keys)
    for key in keys:
        if key in lowered and str(lowered[key]).strip():
            return str(lowered[key]).strip()
    # loose match for messy headers ("Transaction Amount (USD)") — token-boundary only,
    # and never for very short abbreviations (avoids "cr" matching "desCRiption").
    for key in keys:
        if len(key) < 4:
            continue
        for hk, hv in lowered.items():
            tokens = re.split(r"[^a-z0-9]+", hk)
            if (key in tokens or (" " in key and key in hk)) and str(hv).strip():
                return str(hv).strip()
    return None


def _to_minor_units(raw: str | int | float | None) -> int:
    if raw is None:
        return 0
    if isinstance(raw, int | float):
        return round(float(raw) * 100)
    s = str(raw).strip()
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()")
    # locale-agnostic: strip currency symbols/spaces, treat last '.'/',' as decimal sep
    s = re.sub(r"[^\d.,\-]", "", s)
    if "," in s and "." in s:
        s = (
            s.replace(",", "")
            if s.rfind(".") > s.rfind(",")
            else s.replace(".", "").replace(",", ".")
        )
    elif s.count(",") == 1 and len(s.split(",")[-1]) == 2:
        s = s.replace(",", ".")
    else:
        s = s.replace(",", "")
    if not s or s in {"-", "."}:
        return 0
    try:
        val = round(float(s) * 100)
    except ValueError:
        return 0
    return -val if neg else val


def _parse_date(raw: str | None, default_timezone: str = "UTC") -> datetime:
    source_tz = ZoneInfo(default_timezone)
    if not raw:
        return datetime.now(UTC)
    try:
        parsed = dateparser.parse(str(raw), dayfirst=True)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=source_tz)
        return parsed.astimezone(UTC)
    except (ValueError, OverflowError, TypeError):
        return datetime.now(UTC)


def _classify(description: str | None, ref: str | None, explicit: str | None) -> RecordType:
    haystack = " ".join(filter(None, [description, ref, explicit])).lower()
    if explicit and explicit.lower() in RecordType.__members__:
        return RecordType[explicit.lower()]
    if "invoice #" in haystack or re.search(r"\binvoice\s+(no|number|#)", haystack):
        return RecordType.invoice
    if any(w in haystack for w in ("refund", "reversal", "chargeback")):
        return RecordType.refund
    if any(w in haystack for w in ("fee", "charge", "commission", "levy", "vat", "tax")):
        return RecordType.fee
    if any(w in haystack for w in ("payout", "settlement", "disbursement")):
        return RecordType.payout
    if any(w in haystack for w in ("pmt", "payment", "pay", "transfer", "momo", "deposit", "rtgs")):
        return RecordType.payment
    if _INVOICE_RE.search(haystack or ""):
        return RecordType.payment
    return RecordType.bank_transaction


def _record_id(tenant_id: str, ingestion_id: str, locator: str, payload: str) -> str:
    digest = hashlib.sha256(f"{tenant_id}|{ingestion_id}|{locator}|{payload}".encode()).hexdigest()
    return f"rec_{digest[:24]}"


_TXN_NOISE_RE = re.compile(
    r"\b(pmt|payment|pay|paid|inv|invoice|bill|ref|rrn|tid|txn|trx|transfer|momo|rtgs|"
    r"deposit|withdrawal|to|from|for|via|acct|a/c)\b.*",
    re.IGNORECASE,
)


def _party_from_description(description: str | None) -> str | None:
    if not description:
        return None
    head = _TXN_NOISE_RE.split(description, maxsplit=1)[0].strip(" -:#*/")
    head = re.sub(r"\d[\d-]*$", "", head).strip()
    head = re.sub(r"\s{2,}", " ", head)
    return head if len(head) >= 2 else None


def _normalize_name(name: str | None) -> str | None:
    if not name:
        return None
    cleaned = re.sub(
        r"\b(ltd|limited|inc|incorporated|llc|plc|co|company|corp|corporation|sarl|sa|gmbh|"
        r"pvt|pty|enterprises?|holdings?|group)\b",
        "",
        name.lower(),
    )
    return re.sub(r"[^a-z0-9 ]", "", cleaned).strip() or None


def _extract_ref(description: str | None, explicit: str | None) -> str | None:
    if explicit:
        return explicit
    if not description:
        return None
    m = _INVOICE_RE.search(description)
    if m:
        return f"INV-{m.group(1).upper()}"
    m = _REF_IN_TEXT_RE.search(description)
    return m.group(1).upper() if m else None


def _row_to_record(
    row: dict[str, str],
    *,
    tenant_id: str,
    ingestion_id: str,
    source: str,
    s3_key: str,
    locator: str,
    default_currency: str,
    default_timezone: str,
) -> FinancialRecord:
    credit = _to_minor_units(_first(row, _CREDIT_KEYS))
    debit = _to_minor_units(_first(row, _DEBIT_KEYS))
    amount = _to_minor_units(_first(row, _AMOUNT_KEYS))

    if credit:
        direction, minor = "inbound", credit
    elif debit:
        direction, minor = "outbound", debit
    else:
        direction = "outbound" if amount < 0 else "inbound"
        minor = amount
    minor = abs(minor)

    description = _first(row, _DESC_KEYS)
    ref = _extract_ref(description, _first(row, _REF_KEYS))
    currency = (_first(row, _CURRENCY_KEYS) or default_currency)[:3].upper()
    party_name = _first(row, _PARTY_KEYS) or _party_from_description(description)

    try:
        src = RecordSource(source)
    except ValueError:
        src = RecordSource.other

    metadata: dict = {"raw": row}
    balance = _first(row, _BALANCE_KEYS)
    if balance:
        metadata["running_balance_minor"] = _to_minor_units(balance)

    return FinancialRecord(
        id=_record_id(
            tenant_id, ingestion_id, locator, json.dumps(row, sort_keys=True, default=str)
        ),
        tenant_id=tenant_id,
        type=_classify(description, ref, _first(row, _TYPE_KEYS)),
        source=src,
        amount=Money(minor_units=minor, currency=currency),
        direction=direction,
        occurred_at=_parse_date(_first(row, _DATE_KEYS), default_timezone),
        description=description,
        reference=ref,
        counterparty=Party(name=party_name, normalized_name=_normalize_name(party_name))
        if party_name
        else None,
        ingestion_id=ingestion_id,
        raw_ref=f"{s3_key}#{locator}",
        confidence=round(
            0.55 + 0.2 * bool(minor) + 0.15 * bool(description or ref) + 0.1 * bool(party_name), 2
        ),
        metadata=metadata,
    )


def _rows_have_signal(rows: Sequence[dict[str, str]]) -> bool:
    """Do detected columns yield at least one usable amount + date?"""
    hits = 0
    for r in rows[:20]:
        if _to_minor_units(_first(r, (*_AMOUNT_KEYS, *_DEBIT_KEYS, *_CREDIT_KEYS))) and _first(
            r, _DATE_KEYS
        ):
            hits += 1
    return hits >= max(1, len(rows[:20]) // 3)


def _emit(
    rows: Sequence[dict[str, str]],
    *,
    tenant_id: str,
    ingestion_id: str,
    source: str,
    s3_key: str,
    prefix: str,
    default_currency: str,
    default_timezone: str,
) -> list[FinancialRecord]:
    return [
        _row_to_record(
            {k: ("" if v is None else str(v)) for k, v in row.items()},
            tenant_id=tenant_id,
            ingestion_id=ingestion_id,
            source=source,
            s3_key=s3_key,
            locator=f"{prefix}{i}",
            default_currency=default_currency,
            default_timezone=default_timezone,
        )
        for i, row in enumerate(rows)
    ]


# --- format-specific readers ------------------------------------------------


def _read_csv(body: bytes) -> list[dict[str, str]]:
    text = body.decode("utf-8-sig", errors="replace")
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    lines = text.splitlines()
    # skip pre-amble lines before the real header (bank statements often have a title block)
    header_idx = 0
    for idx, line in enumerate(lines[:15]):
        low = line.lower()
        if any(k in low for k in ("date", "amount", "description", "debit", "credit", "narration")):
            header_idx = idx
            break
    reader = csv.DictReader(lines[header_idx:], dialect=dialect)
    return [{(k or "").strip(): v for k, v in row.items() if k} for row in reader]


def _read_excel(body: bytes) -> list[dict[str, str]]:
    from openpyxl import load_workbook

    wb = load_workbook(io.BytesIO(body), read_only=True, data_only=True)
    out: list[dict[str, str]] = []
    for ws in wb.worksheets:
        grid = [[c if c is not None else "" for c in r] for r in ws.iter_rows(values_only=True)]
        if not grid:
            continue
        header_idx = 0
        for idx, r in enumerate(grid[:15]):
            joined = " ".join(str(x).lower() for x in r)
            if any(k in joined for k in ("date", "amount", "description", "debit", "credit")):
                header_idx = idx
                break
        headers = [str(h).strip() or f"col{j}" for j, h in enumerate(grid[header_idx])]
        for r in grid[header_idx + 1 :]:
            if not any(str(x).strip() for x in r):
                continue
            out.append({headers[j]: str(r[j]) for j in range(min(len(headers), len(r)))})
    wb.close()
    return out


def _read_pdf(body: bytes) -> list[dict[str, str]]:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(body))
    rows: list[dict[str, str]] = []
    for page in reader.pages:
        for line in (page.extract_text() or "").splitlines():
            m = _PDF_LINE_RE.match(line.strip())
            if not m:
                continue
            g = m.groupdict()
            rows.append(
                {
                    "date": g["date"],
                    "description": g["desc"].strip(),
                    "amount": g["amount"],
                    "balance": g.get("balance") or "",
                }
            )
    return rows


# --- public entrypoint -----------------------------------------------------


def parse_document(
    body: bytes,
    *,
    content_type: str,
    tenant_id: str,
    ingestion_id: str,
    source: str,
    s3_key: str,
    default_currency: str = "XXX",
    default_timezone: str = "UTC",
) -> ParseResult:
    ct = content_type.lower()
    warnings: list[str] = []
    rows: list[dict[str, str]]
    prefix = "row"

    try:
        if "json" in ct:
            doc = json.loads(body)
            raw = doc.get("records", doc) if isinstance(doc, dict) else doc
            rows = [r if isinstance(r, dict) else {"value": str(r)} for r in raw]
            prefix = "json["
        elif "csv" in ct or ct == "text/plain":
            rows = _read_csv(body)
        elif "spreadsheet" in ct or "excel" in ct or ct.endswith(("xlsx", "xls")):
            rows = _read_excel(body)
        elif "pdf" in ct:
            rows = _read_pdf(body)
            if not rows:
                warnings.append("no statement lines matched the PDF layout heuristic")
        else:
            return ParseResult(
                warnings=[f"unsupported content type: {content_type}"], recognised=False
            )
    except Exception as exc:
        return ParseResult(warnings=[f"parse error: {exc}"], recognised=False)

    if not rows:
        return ParseResult(warnings=warnings or ["no rows found"], recognised=bool(warnings))

    missing_currency = sum(not _first(row, _CURRENCY_KEYS) for row in rows)
    if missing_currency and default_currency == "XXX":
        warnings.append(
            f"{missing_currency} row(s) had no currency; marked as XXX (unknown currency)"
        )

    records = _emit(
        rows,
        tenant_id=tenant_id,
        ingestion_id=ingestion_id,
        source=source,
        s3_key=s3_key,
        prefix=prefix if prefix != "json[" else "json[",
        default_currency=default_currency,
        default_timezone=default_timezone,
    )
    if prefix == "json[":
        for r in records:
            r.raw_ref = r.raw_ref  # locators already unique
    if not _rows_have_signal(rows):
        warnings.append("low-confidence column detection — an AI column mapper pass is recommended")
    low = [r for r in records if r.amount.minor_units == 0]
    if low:
        warnings.append(f"{len(low)} row(s) parsed with a zero amount")
    return ParseResult(records=records, warnings=warnings, recognised=True)


def parse_bytes(
    body: bytes,
    *,
    content_type: str,
    tenant_id: str,
    ingestion_id: str,
    source: str,
    s3_key: str,
    default_currency: str = "XXX",
    default_timezone: str = "UTC",
) -> ParseResult:
    """Backwards-compatible wrapper — behaves like a list of records."""
    return parse_document(
        body,
        content_type=content_type,
        tenant_id=tenant_id,
        ingestion_id=ingestion_id,
        source=source,
        s3_key=s3_key,
        default_currency=default_currency,
        default_timezone=default_timezone,
    )
