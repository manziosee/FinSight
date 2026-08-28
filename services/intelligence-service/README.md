# intelligence-service

SCAFFOLD. Bring-your-own-AI provider abstraction (src/intelligence_service/llm.py; Anthropic default, offline echo fallback). Endpoints: POST /v1/transactions/explain, POST /v1/financial/ask. Returns provider output + a stub evidence block.

Port 8000. Shared building blocks come from `finsight-common`. See [ARCHITECTURE.md](../../ARCHITECTURE.md).
