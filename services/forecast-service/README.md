# forecast-service

🧪 **Scaffold.** Naive linear cash-flow projection and a scenario stub.

| Endpoint | Scope |
|---|---|
| `POST /v1/forecast` | `forecast:run` |
| `POST /v1/simulate` | `forecast:run` |

Port 8000 (`/health`, `/ready`, `/metrics`, `/docs`). Shared building blocks come from
[finsight-common](../../libs/finsight-common). See [ARCHITECTURE.md](../../ARCHITECTURE.md).
