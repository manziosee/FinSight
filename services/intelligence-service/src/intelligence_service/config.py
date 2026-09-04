from __future__ import annotations

from functools import lru_cache

from finsight_common.config import ServiceSettings


class Settings(ServiceSettings):
    service_name: str = "intelligence-service"

    reconciliation_url: str = "http://reconciliation-service:8000"
    graph_url: str = "http://graph-service:8000"

    llm_provider: str = "anthropic"
    llm_model: str = "claude-opus-5"


@lru_cache
def get_settings() -> Settings:
    return Settings()
