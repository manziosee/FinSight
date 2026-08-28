import json

from normalization_service.parsers import parse_bytes


def test_parse_csv_bank_statement_infers_fields() -> None:
    csv = (
        "Date,Description,Amount,Currency,Reference\n"
        "2026-08-28,ABC LTD PMT INV-439,850000,RWF,\n"
        "2026-08-20,Invoice #439 ABC Ltd,850000,RWF,INV-439\n"
    )
    records = parse_bytes(
        csv.encode(),
        content_type="text/csv",
        tenant_id="t1",
        ingestion_id="ing1",
        source="bank",
        s3_key="t1/x.csv",
    )
    assert len(records) == 2
    payment = records[0]
    assert payment.amount.minor_units == 85_000_000
    assert payment.amount.currency == "RWF"
    assert payment.reference == "INV-439"
    assert payment.counterparty and payment.counterparty.normalized_name == "abc"


def test_parse_json_records_roundtrip() -> None:
    body = json.dumps(
        {"records": [{"amount": -42.5, "description": "Bank fee", "currency": "usd"}]}
    ).encode()
    records = parse_bytes(
        body,
        content_type="application/json",
        tenant_id="t1",
        ingestion_id="ing1",
        source="bank",
        s3_key="inline",
    )
    rec = records[0]
    assert rec.amount.minor_units == 4250
    assert rec.direction == "outbound"
    assert str(rec.type) == "fee"


def test_unsupported_content_type_returns_empty() -> None:
    assert (
        parse_bytes(
            b"%PDF-1.4",
            content_type="application/pdf",
            tenant_id="t",
            ingestion_id="i",
            source="pdf",
            s3_key="k",
        )
        == []
    )
