# intelligence-service

Explains and answers questions about a tenant's financial data. Answers are grounded in
evidence fetched live from reconciliation-service with the caller's own token: the model
narrates real figures and never invents them. PII fields are redacted before anything is
sent to an AI provider.

Bring-your-own-AI ([llm.py](src/intelligence_service/llm.py)), chosen with `FINSIGHT_LLM_PROVIDER`:

| Provider | Needs | Default model |
|---|---|---|
| `anthropic` (default) | `ANTHROPIC_API_KEY` | `claude-opus-5-5` |
| `groq` | `GROQ_API_KEY` | `openai/gpt-oss-120b` |
| `openrouter` | `OPENROUTER_API_KEY` | `meta-llama/llama-3.3-70b-instruct` |
| `ollama` | a reachable Ollama server (`OLLAMA_BASE_URL`, default `http://localhost:11434/v1`) | `llama3.1` |
| `openai` | `OPENAI_API_KEY` (any OpenAI-compatible API via `FINSIGHT_LLM_BASE_URL`) | `gpt-4o-mini` |

`FINSIGHT_LLM_MODEL` overrides the model. Without the needed key the service falls back to an
offline echo provider, so the API keeps working (answers start with `[offline-explanation]`).

| Endpoint | Scope |
|---|---|
| `POST /v1/transactions/explain` | `transactions:read` — explain a match or unmatched record in a run |
| `POST /v1/financial/ask` | `financial:ask` — free-text question over the latest reconciliation |

Port 8000 (`/health`, `/ready`, `/metrics`, `/docs`). Shared building blocks come from
[finsight-common](../../libs/finsight-common). See [ARCHITECTURE.md](../../ARCHITECTURE.md).
