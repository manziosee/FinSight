# reconciliation-service

Consumes 'transaction.normalized' into PostgreSQL, then the matching engine (src/reconciliation_service/matching.py) does greedy 1:1 payment↔invoice assignment with weighted signals (amount, reference fuzz, counterparty, recency) producing a confidence + explanation. Endpoints: POST /v1/reconciliation/run, GET /v1/reconciliation/{id}, POST /v1/payments/match.

Port 8000. Shared building blocks come from `finsight-common`. See [ARCHITECTURE.md](../../ARCHITECTURE.md).
