from __future__ import annotations

from functools import lru_cache

from finsight_common.config import ServiceSettings


class Settings(ServiceSettings):
    service_name: str = "intelligence-service"

    reconciliation_url: str = "http://reconciliation-service:8000"
    graph_url: str = "http://graph-service:8000"

    # anthropic | groq | openrouter | ollama | openai — see llm.py
    llm_provider: str = "anthropic"
    # Empty = the provider's default model.
    llm_model: str | None = None
    # Override the provider's endpoint (e.g. a remote Ollama server).
    llm_base_url: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
