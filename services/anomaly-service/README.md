# anomaly-service

🧪 **Scaffold.** Rule + statistical checks (amount z-score, duplicate payments); ML models
are not built yet.

| Endpoint | Scope |
|---|---|
| `POST /v1/anomalies/detect` | `anomalies:read` |
| `POST /v1/anomalies/explain` | `anomalies:read` |

Port 8000 (`/health`, `/ready`, `/metrics`, `/docs`). Shared building blocks come from
[finsight-common](../../libs/finsight-common). See [ARCHITECTURE.md](../../ARCHITECTURE.md).
