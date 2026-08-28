# graph-service

Consumes 'transaction.normalized' and upserts nodes/edges into Neo4j (Customer/Invoice/Payment/BankTransaction + PAYS/TRANSACTED). Publishes 'graph.updated'. Endpoints: GET /v1/graph/entities/{id}, GET /v1/graph/paths.

Port 8000. Shared building blocks come from `finsight-common`. See [ARCHITECTURE.md](../../ARCHITECTURE.md).
