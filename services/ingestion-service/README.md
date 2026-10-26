# ingestion-service

Accepts raw financial data and makes it durable before anything else happens. Owns the
`ingestion` PostgreSQL database.

Raw bytes go to object storage (S3 on AWS, Tigris on Fly, SeaweedFS locally). The ingestion
row and the `data.ingested` event are written in **one transaction** (transactional outbox);
a relay publishes the event to Kafka. When normalization reports back, the ingestion moves
to `completed` or `failed` with record count and warnings.

| Endpoint | Scope |
|---|---|
| `POST /v1/data/upload` | `data:write` — multipart file: CSV, JSON, Excel, PDF, text |
| `POST /v1/data/ingest` | `data:write` — JSON records |
| `GET /v1/data/ingestions/{ingestion_id}` | `data:write` — status, record count, warnings |

Events: publishes `data.ingested`; consumes `transaction.normalized`.

Port 8000 (`/health`, `/ready`, `/metrics`, `/docs`). Shared building blocks come from
[finsight-common](../../libs/finsight-common). See [ARCHITECTURE.md](../../ARCHITECTURE.md).
