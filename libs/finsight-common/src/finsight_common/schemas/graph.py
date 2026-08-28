"""Financial-graph node and edge models (persisted in Neo4j by graph-service)."""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class NodeType(StrEnum):
    customer = "Customer"
    vendor = "Vendor"
    order = "Order"
    invoice = "Invoice"
    payment = "Payment"
    bank_transaction = "BankTransaction"
    account = "Account"
    ledger_entry = "LedgerEntry"


class EdgeType(StrEnum):
    placed = "PLACED"  # Customer -> Order
    billed_by = "BILLED_BY"  # Order -> Invoice
    pays = "PAYS"  # Payment -> Invoice
    settled_by = "SETTLED_BY"  # Payment -> BankTransaction
    held_in = "HELD_IN"  # BankTransaction -> Account
    posts_to = "POSTS_TO"  # Payment -> LedgerEntry
    matched_to = "MATCHED_TO"  # generic reconciliation link


class Node(BaseModel):
    id: str
    tenant_id: str
    type: NodeType
    label: str | None = None
    properties: dict[str, Any] = Field(default_factory=dict)

    model_config = {"use_enum_values": True}


class Edge(BaseModel):
    tenant_id: str
    type: EdgeType
    from_id: str
    to_id: str
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    properties: dict[str, Any] = Field(default_factory=dict)

    model_config = {"use_enum_values": True}
