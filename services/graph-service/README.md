# graph-service

Builds and queries the financial graph in Neo4j. Consumes `transaction.normalized` and
upserts tenant-scoped nodes (Customer, Invoice, Payment, BankTransaction, …) and edges
(`PAYS`, `TRANSACTED`); publishes `graph.updated`.

| Endpoint | Scope |
|---|---|
| `GET /v1/graph/entities/{entity_id}?depth=1..4` | `graph:read` — an entity and its neighbourhood |
| `GET /v1/graph/paths?from_id=&to_id=` | `graph:read` — shortest paths between two entities |

Port 8000 (`/health`, `/ready`, `/metrics`, `/docs`). Shared building blocks come from
[finsight-common](../../libs/finsight-common). See [ARCHITECTURE.md](../../ARCHITECTURE.md).
