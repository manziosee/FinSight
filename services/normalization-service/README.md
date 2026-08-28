# normalization-service

Consumes 'data.ingested', fetches the object, runs the heuristic parsers (src/normalization_service/parsers.py) into the Universal Financial Schema, publishes 'transaction.normalized'. Also sync: POST /v1/transactions/understand.

Port 8000. Shared building blocks come from `finsight-common`. See [ARCHITECTURE.md](../../ARCHITECTURE.md).
