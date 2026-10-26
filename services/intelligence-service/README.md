# intelligence-service

Explains and answers questions about a tenant's financial data. Answers are grounded in
evidence fetched live from reconciliation-service with the caller's own token: the model
narrates real figures and never invents them. PII fields are redacted before anything is
sent to an AI provider.

Bring-your-own-AI ([llm.py](src/intelligence_service/llm.py)): Anthropic by default
(`ANTHROPIC_API_KEY`, `FINSIGHT_LLM_MODEL`); without a key it falls back to an offline echo
provider, so the API keeps working.

| Endpoint | Scope |
|---|---|
| `POST /v1/transactions/explain` | `transactions:read` — explain a match or unmatched record in a run |
| `POST /v1/financial/ask` | `financial:ask` — free-text question over the latest reconciliation |

Port 8000 (`/health`, `/ready`, `/metrics`, `/docs`). Shared building blocks come from
[finsight-common](../../libs/finsight-common). See [ARCHITECTURE.md](../../ARCHITECTURE.md).
