# normalization-service

Turns messy inputs into the **Universal Financial Schema**. Owns the `normalization`
PostgreSQL database (entity resolution + idempotency).

Consumes `data.ingested`, reads the raw file, and runs tolerant parsers
([parsers.py](src/normalization_service/parsers.py)) over bank statements, mobile-money
exports, invoices and spreadsheets (CSV, JSON, Excel, PDF): column detection, currency and
direction inference, reference extraction. Counterparties are resolved to canonical
per-tenant entities. Publishes `transaction.normalized` through the outbox.

| Endpoint | Scope |
|---|---|
| `POST /v1/transactions/understand` | `transactions:read` — normalize one transaction synchronously |

Port 8000 (`/health`, `/ready`, `/metrics`, `/docs`). Shared building blocks come from
[finsight-common](../../libs/finsight-common). See [ARCHITECTURE.md](../../ARCHITECTURE.md).
