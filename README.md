# FinSight

**The intelligence layer for financial data.**

FinSight is an AI-powered financial-intelligence API. Give it whatever financial data a
business has — bank statements, mobile money, invoices, receipts, spreadsheets, POS,
payment gateways, ERP exports, in any format and any currency — and it connects, understands,
reconciles, explains, detects anomalies in, predicts, and acts on it.

Reconciliation is the entry point, not the product. The moat is handling **messy, fragmented,
multi-format, multi-currency** real-world financial data extremely well.

```
        ANY FINANCIAL DATA
               ↓
     CONNECT → NORMALIZE → FINANCIAL GRAPH
               ↓
   RECONCILE · UNDERSTAND · DETECT ANOMALIES
               ↓
      EXPLAIN → PREDICT → SIMULATE → ACT
```

## Architecture at a glance

Python 3.12 · FastAPI microservices · Kafka event backbone · PostgreSQL · Neo4j (financial graph) ·
Redis · S3 · OpenTelemetry. Deployed to AWS EKS via Helm; infra in Terraform. See
[ARCHITECTURE.md](ARCHITECTURE.md) and [docs/adr/](docs/adr/).

| Service | Role | Status |
|---|---|---|
| [api-gateway](services/api-gateway) | Auth, routing, unified OpenAPI, rate limiting | ✅ real |
| [identity-service](services/identity-service) | Tenants, OAuth2 clients, API keys, JWT/JWKS | ✅ real |
| [ingestion-service](services/ingestion-service) | Accept raw data → object storage → `data.ingested` | ✅ real |
| [normalization-service](services/normalization-service) | Parse → Universal Financial Schema → `transaction.normalized` | ✅ real |
| [graph-service](services/graph-service) | Build & query the financial graph (Neo4j) | ✅ real |
| [reconciliation-service](services/reconciliation-service) | Match payments↔invoices with confidence + explanation | ✅ real |
| [intelligence-service](services/intelligence-service) | Understand / explain / ask (bring-your-own-AI) | 🧪 scaffold |
| [anomaly-service](services/anomaly-service) | Rule + statistical anomaly detection | 🧪 scaffold |
| [forecast-service](services/forecast-service) | Cash-flow forecasting & simulation | 🧪 scaffold |
| [action-service](services/action-service) | Approval-gated actions + AI-agent tool surface | 🧪 scaffold |
| [console](console) | Next.js reference UI: connect, upload, reconciliation review queue, ask, audit | ✅ real |

## Quick start

```bash
make bootstrap     # generate .env + local secrets
make up            # build & start the whole stack (Docker Compose)
make seed          # push demo invoices + a bank statement through the API
make smoke         # end-to-end assertion: upload → normalize → graph → reconcile
```

Then open:

| URL | What |
|---|---|
| http://localhost:3300 | **Console** — connect, upload, work the reconciliation review queue, ask questions |
| http://localhost:8088/docs | Unified FinSight API (Swagger, via Traefik → gateway) |
| http://localhost:18081 | Standalone Swagger UI (committed aggregated spec) |
| http://localhost:16686 | Jaeger traces |
| http://localhost:13000 | Grafana (anonymous) |
| http://localhost:18082 | Redpanda console (Kafka) |

### Try it

```bash
TOKEN=$(curl -s -X POST http://localhost:8088/v1/auth/token \
  -d grant_type=client_credentials -d client_id=demo-client -d client_secret=demo-secret \
  | jq -r .access_token)

curl -s -X POST http://localhost:8088/v1/transactions/understand \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"transaction":{"amount":850000,"currency":"RWF","description":"ABC LTD PMT INV 439","date":"2026-08-28"}}' | jq
```

## Development

```bash
make install    # uv sync the workspace
make lint       # ruff + ruff format --check + mypy
make test       # unit tests
make test-all   # + integration (needs docker)
make openapi    # regenerate docs/api/finsight.openapi.json
```

Repo layout, coding standards and the contribution flow: [CONTRIBUTING.md](CONTRIBUTING.md).
Security posture and disclosure: [SECURITY.md](SECURITY.md).

## Deploy

* **Kubernetes:** `deploy/helm/finsight` (umbrella chart) + `deploy/k8s` (kustomize overlays).
* **AWS infra:** `deploy/terraform` (`envs/staging`, `envs/production`).
* **Pipelines:** `.github/workflows/` — `ci`, `security`, `cd-staging`, `cd-production`, `docs`.

See [docs/runbooks/deploy.md](docs/runbooks/deploy.md).
