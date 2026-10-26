# action-service

🧪 **Scaffold.** Approval-gated actions and a discoverable tool catalog for AI agents
(MCP-style). Requested actions are recorded as `pending_approval` and never executed.

| Endpoint | Scope |
|---|---|
| `GET /v1/actions/catalog` | `actions:execute` |
| `POST /v1/actions/execute` | `actions:execute` |

Port 8000 (`/health`, `/ready`, `/metrics`, `/docs`). Shared building blocks come from
[finsight-common](../../libs/finsight-common). See [ARCHITECTURE.md](../../ARCHITECTURE.md).
