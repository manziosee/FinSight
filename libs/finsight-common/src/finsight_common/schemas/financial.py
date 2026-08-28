"""The Universal Financial Schema.

Every inbound record — bank line, mobile-money transfer, invoice, receipt, POS sale,
ledger entry — is normalized into a :class:`FinancialRecord`. Amounts are stored as
integer **minor units** (e.g. cents) to avoid floating-point drift.
"""

from __future__ import annotations

import datetime as dt
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field, field_validator


class RecordType(StrEnum):
    payment = "payment"
    invoice = "invoice"
    order = "order"
    bank_transaction = "bank_transaction"
    receipt = "receipt"
    ledger_entry = "ledger_entry"
    payout = "payout"
    refund = "refund"
    fee = "fee"
    transfer = "transfer"
    unknown = "unknown"


class RecordSource(StrEnum):
    bank = "bank"
    mobile_money = "mobile_money"
    card = "card"
    cash = "cash"
    payment_gateway = "payment_gateway"
    pos = "pos"
    erp = "erp"
    accounting = "accounting"
    spreadsheet = "spreadsheet"
    pdf = "pdf"
    api = "api"
    other = "other"


class Money(BaseModel):
    minor_units: int = Field(description="Amount in the smallest currency unit (e.g. cents).")
    currency: str = Field(min_length=3, max_length=3, description="ISO 4217 code, uppercase.")

    @field_validator("currency")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.upper()

    @property
    def decimal(self) -> float:
        return self.minor_units / 100


class Party(BaseModel):
    name: str | None = None
    normalized_name: str | None = Field(
        default=None, description="Deduplicated/canonical name for entity resolution."
    )
    external_id: str | None = None
    account_ref: str | None = None
    kind: str | None = Field(default=None, description="customer | vendor | employee | bank | self")


class FinancialRecord(BaseModel):
    """Canonical representation of a single financial fact."""

    id: str = Field(description="Deterministic id assigned by normalization-service.")
    tenant_id: str
    type: RecordType = RecordType.unknown
    source: RecordSource = RecordSource.other

    amount: Money
    direction: str = Field(default="unknown", description="inbound | outbound | unknown")

    occurred_at: dt.datetime
    booked_at: dt.datetime | None = None

    description: str | None = None
    reference: str | None = Field(default=None, description="Invoice no., payment ref, memo, etc.")
    counterparty: Party | None = None
    account: Party | None = None

    ingestion_id: str = Field(description="Batch/file this record came from.")
    raw_ref: str = Field(description="Pointer (S3 key + row/locator) to the original data.")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = {"use_enum_values": True}
