# reconciliation-service

Matches payments to invoices and explains every result. Owns the `reconciliation`
PostgreSQL database.

Consumes `transaction.normalized` into its store. A run
([matching.py](src/reconciliation_service/matching.py)) scores candidates on weighted
signals (amount, reference similarity, counterparty, recency), handles partial, split and
over/under payments and FX, and gives each match a confidence plus a human-readable
explanation. High-confidence matches are auto-accepted; the rest wait in a review queue, and
review decisions retune the weights per tenant.

| Endpoint | Scope |
|---|---|
| `POST /v1/reconciliation/run` | `reconciliation:run` |
| `GET /v1/reconciliation/{run_id}` | `reconciliation:read` |
| `GET /v1/reconciliation/{run_id}/matches?status=pending` | `reconciliation:read` — review queue |
| `POST /v1/reconciliation/matches/{match_id}/review` | `reconciliation:run` — accept / reject / correct |
| `GET /v1/reconciliation/summary` | `reconciliation:read` — evidence for intelligence-service |
| `GET /v1/reconciliation/weights` | `reconciliation:read` — this tenant's tuned weights |
| `POST /v1/payments/match` | `payments:match` — score one payment/invoice pair |

Events: publishes `reconciliation.completed`, `reconciliation.match_reviewed`.

Port 8000 (`/health`, `/ready`, `/metrics`, `/docs`). Shared building blocks come from
[finsight-common](../../libs/finsight-common). See [ARCHITECTURE.md](../../ARCHITECTURE.md).
