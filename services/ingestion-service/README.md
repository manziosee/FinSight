# ingestion-service

Accepts raw financial data (JSON records or file upload: CSV/JSON/Excel/PDF), lands it in
S3/MinIO, records an ingestion row + outbox event in one transaction, and a relay publishes
`data.ingested`. Poll `GET /v1/data/ingestions/{ingestion_id}` for completion, record count,
warnings, or a parsing error. Endpoints: `POST /v1/data/ingest`, `POST /v1/data/upload`,
`GET /v1/data/ingestions/{ingestion_id}`.

Port 8000. Shared building blocks come from `finsight-common`. See [ARCHITECTURE.md](../../ARCHITECTURE.md).
