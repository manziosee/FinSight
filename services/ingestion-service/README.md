# ingestion-service

Accepts raw financial data (JSON records or file upload: CSV/JSON/Excel/PDF), lands it in S3/MinIO, records an ingestion row + outbox event in one transaction, and a relay publishes 'data.ingested'. Endpoints: POST /v1/data/ingest, POST /v1/data/upload.

Port 8000. Shared building blocks come from `finsight-common`. See [ARCHITECTURE.md](../../ARCHITECTURE.md).
